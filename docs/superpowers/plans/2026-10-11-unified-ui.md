# Единый интерфейс TIREDWOOD (UI 2.0) — план внедрения

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** перенести утверждённый на странице-обзоре интерфейс 2.0 (раскладка по слотам, компактный HUD, окна, иконки, звуки,
шкурка «Ретро-парк 2.0») во всю игру одним большим патчем в ветке `mode/ui`.

**Architecture:** один общий кит в `client/ui/kit/` (токены + CSS-компоненты `.k-*` + тонкие DOM-помощники + иконки + масштаб +
звуки) переносится из `lab/ui/kit/` почти дословно. Поверх `#hud` встаёт слой слотов 1440×900 (ВЛ, ВЦ, ВП, НЛ, НЦ, НП, центр),
масштабируемый одним `zoom`. Каждая группа экранов (вход, площадь, меню, рыбалка, ферма, крепость, режимы) переводит свою
разметку на классы кита в своих файлах; эталон — сцены страницы `lab/ui` (тег `ui-review-v2`).

**Tech Stack:** TypeScript без сборки на сервере, Vite, DOM без фреймворка (`innerHTML` и `el()`), CSS, WebAudio, `node --test`,
headless Chrome через CDP.

## Global Constraints

- Эталон вида — https://tired.solutions/tech/tiredwood-ui-v2/ и исходник `lab/ui/` (тег `ui-review-v2`). Сцена на странице = экран в игре.
- Шкурка — только `retro2` «Ретро-парк 2.0» (ответ владельца 11.10: вывески — Г; для всего UI — ждём подтверждения, см. Task 0).
- Раскладка окон, меню Esc, «Кто где» (Tab) — как на странице; владелец: «меню можно не трогать», «таб тоже неплохой».
- Блэкджек, дурак, бильярд, Подземелье — свой вид не меняем, только общее: бейдж, чат-док, шрифт, кнопки, клавиши, тосты.
- Fight Club удаляется тредом набережной — не трогать `client/fight/`, `server/fight/`.
- Шрифт ≥ 14 px; 13 px — только третичные подписи; меньше 13 нельзя. Числа `tabular-nums`.
- Иконки — картинки из `client/assets/ui/icons/` (88 шт., imagegen); эмодзи как иконки интерфейса — убрать.
- Своё — золотом; опасность — красным; одна информация — в одном месте (уровень и жетоны — только бейдж).
- Подсказок только в `title` быть не должно: в игре мышь захвачена.
- Цвета категорий рыбы `--tier-*` = `shared/fishrules.ts TIER_CSS`, вид шкалы вываживания не меняем.
- Сине-жёлтое вместе на флагах/вымпелах/лодках — нет.
- Нет `backdrop-filter` в HUD боя (бюджет кадра, `docs/optimization.md`); у `retro2` `--plate-blur: none` — так и оставить.
- Без новых npm-пакетов без «да» владельца (единственный кандидат — `@fontsource/rubik-mono-one`, Task 0).
- Протокол и сервер не меняются; `PROTOCOL_VERSION` не трогать.
- python3 сломан — node. Удаление — только в `~/.Trash`. Headless Chrome — свой профиль и порт, гасить по своему PID.
- Проверка в конце каждой задачи: `npm run check && npm test && npm run build` + снимки главных состояний (1440×900, headless).
- Слияние в `main` и выкладка — только по «да» владельца.

## Решения ведущего (почему так)

1. **Без флага.** Редизайн уже показан владельцу «рендером» (страница-обзор), он только про вид, данные и протокол не меняются;
   откат = прошлый релиз (`deploy.sh` хранит его). Держать два UI за флагом — двойная работа на каждом экране.
2. **Масштаб одним `zoom`.** Кит нарисован в пикселях сцены 1440×900. В игре `#hud` и `#menus` получают
   `zoom: var(--hud-k)`, где `--hud-k = clamp(0.8, min(vw/1440, vh/900), 1.6) × настройка «Размер интерфейса»`.
   На 2K (2560×1440) это 1,6 — владелец играет на 2K. Старые `zoom: var(--ui-scale)` на отдельных селекторах убираются.
3. **Верх-центр — один менеджер.** Сейчас там толкаются 8 систем (голосование, шторм, пираты, таймер аквапарка, джекпот,
   связь, тосты, ожидание). Будет одна плашка события (по приоритету) и до 3 тостов под ней.
4. **Звуки интерфейса** — синтез из `lab/ui/kit/sfx.js` через шину `sound.kit.ui` (уважает общую громкость и «Интерфейс»),
   плюс выключатель «Звуки интерфейса» в Esc → Звук.
5. **Порядок:** фундамент и оболочка площади — последовательно (их используют все). Дальше группы — параллельно в своих
   worktree-ветках от `mode/ui`, ведущий сливает.

## Карта файлов

Создать:
- `client/ui/kit/tokens.css` — из `lab/ui/kit/tokens.css`: общий `:root`, `:root, [data-skin]` (h/w-пары) и только блок `retro2`;
  без `@font-face` (шрифты — из `@fontsource`).
- `client/ui/kit/kit.css` — из `lab/ui/kit/kit.css` дословно, пути картинок → через CSS-переменные (см. Task 1).
- `client/ui/kit/combat.css` — из `lab/ui/kit/combat.css` дословно.
- `client/ui/kit/icons.ts` — `uiIcon(id)` по `import.meta.glob` из `client/assets/ui/icons/*.webp`.
- `client/ui/kit/dom.ts` — `h()` и готовые куски разметки (`keyHtml`, `coinHtml`, `iconImg`, `meterHtml`, `tileHtml`, `toastEl`).
- `client/ui/kit/scale.ts` — `hudScale()` (чистая) и `bindHudScale()`.
- `client/ui/kit/topcenter.ts` — `TopCenterModel` (чистая логика) и `TopCenter` (DOM).
- `client/ui/kit/slots.ts` — слой слотов `HudSlots`.
- `client/ui/kit/sfx.ts` — звуки интерфейса.
- `client/ui/kit/badge.ts` — бейдж игрока (ВП).
- `test/ui-kit.test.ts` — тесты `hudScale` и `TopCenterModel`.
- `docs/ui.md` — справочник кита для игры (из `lab/ui/kit/KIT.md`, раздел «Версия 2» + компоненты).

Изменить (по задачам ниже): `index.html`, `client/startup-game.ts`, `client/styles.css`, `client/app.ts`, `client/settings.ts`,
`client/ui/*.ts|css`, `client/ui/menu/*`, `client/lobby/hud.ts`, `client/lobby/storm.ts`, `client/lobby/piratehud.ts`,
`client/lobby/fish*.ts|css`, `client/boat/*`, `client/farm/**`, `client/fort/**`, `client/paintball/*`, `client/race/*`,
`client/hide/*`, `client/skilltest/*`, `client/lobby/{ratrace,regatta,roulette,plane}*`, `docs/README.md`.

---

### Task 0: Ответы владельца и шрифт заголовков

**Files:**
- Modify: `package.json`, `package-lock.json` (только при «да» на пакет)
- Modify: `client/startup-game.ts:2-5`

**Interfaces:**
- Produces: CSS-переменная `--font-display` в `client/ui/kit/tokens.css` = `'Rubik Mono One', Rubik, system-ui, sans-serif`
  (при «да») или `Rubik, system-ui, sans-serif` + `--display-weight: 900` (без пакета).

- [ ] **Step 1: Дождаться ответов в треде** — (1) Г для всего интерфейса? (2) можно ли пакет `@fontsource/rubik-mono-one`?
  Если владелец выбрал другой стиль или шрифт — заменить блок `retro2` в Task 1 на выбранный (`beach`/`dusk` из
  `lab/ui/kit/tokens.css`) и/или `--font-display` на выбранный шрифт. Остальной план не меняется.
- [ ] **Step 2: Поставить пакет (только при «да»)**

```bash
cd /Users/tired/Desktop/game-opus-ui && npm install @fontsource/rubik-mono-one@5 --save
```
`node_modules` общий для всех worktree — после установки написать координатору одну строку «rubik-mono-one установлен».

- [ ] **Step 3: Подключить начертания**

```ts
// client/startup-game.ts — после строк Rubik 400/500/700/900
import '@fontsource/rubik/600.css';
import '@fontsource/rubik/800.css';
import '@fontsource/rubik-mono-one/cyrillic-400.css'; // только при «да» на пакет
import '@fontsource/rubik-mono-one/latin-400.css';    // только при «да» на пакет
```
- [ ] **Step 4: Проверка** — `npm run check && npm run build`; в `dist/assets` есть `rubik-mono-one-cyrillic-400-normal-*.woff2`.
- [ ] **Step 5: Commit** — `git commit -m "ui: шрифты Rubik 600/800 и заголовочный Rubik Mono One"`

---

### Task 1: Кит в клиенте (токены, компоненты, иконки, масштаб, звуки)

**Files:**
- Create: `client/ui/kit/tokens.css`, `client/ui/kit/kit.css`, `client/ui/kit/combat.css`, `client/ui/kit/icons.ts`,
  `client/ui/kit/dom.ts`, `client/ui/kit/scale.ts`, `client/ui/kit/sfx.ts`, `test/ui-kit.test.ts`
- Modify: `index.html` (атрибут `data-skin="retro2"` на `<html>`), `client/startup-game.ts` (импорт CSS кита до `styles.css`),
  `client/settings.ts` (поле `uiSounds`), `client/ui/menu/settings-panel.ts` (переключатель), `client/app.ts` (`bindHudScale`, `sfx.attach`)

**Interfaces:**
- Produces:
  - `hudScale(vw: number, vh: number, uiScale: number): number`
  - `bindHudScale(root: HTMLElement, getUiScale: () => number): () => void` — ставит `--hud-k` на `root`, возвращает отписку
  - `uiIcon(id: string): string` — URL картинки или `''`
  - `h<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, html?: string): HTMLElementTagNameMap[K]`
  - `keyHtml(k: string, corner?: 'tr'|'tl'|'br'|'bl'|'b', size?: 'sm'|'lg'): string`, `coinHtml(cls?: string): string`,
    `iconImg(id: string, cls?: string): string`, `meterHtml(v: number, tone?: string, cls?: string): string`
  - `sfx.play(name: 'click'|'open'|'close'|'reward'|'error'|'toast'|'tick'|'pop'|'level'): void`,
    `sfx.attach(kit: { ctx: AudioContext; ui: GainNode } | null): void`, `sfx.enabled: boolean`

- [ ] **Step 1: Написать падающий тест масштаба**

```ts
// test/ui-kit.test.ts
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { hudScale } from '../client/ui/kit/scale.ts';

test('масштаб HUD: 1440×900 — 1, 2K — 1,6, маленький экран — не меньше 0,8', () => {
  assert.equal(hudScale(1440, 900, 1), 1);
  assert.equal(hudScale(2560, 1440, 1), 1.6);
  assert.equal(hudScale(1280, 720, 1), 0.8);
  assert.equal(hudScale(1920, 1080, 1), 1.2);
  assert.equal(hudScale(1920, 1080, 1.15), 1.38);
});
```
- [ ] **Step 2: Запустить — падает** (`node --test test/ui-kit.test.ts` → «Cannot find module …/scale.ts»).
- [ ] **Step 3: Реализовать `scale.ts`**

```ts
// client/ui/kit/scale.ts
// Кит нарисован в пикселях сцены 1440×900. Весь HUD и окна масштабируются одним zoom: var(--hud-k).
const W = 1440;
const H = 900;
const MIN = 0.8;
const MAX = 1.6;

export function hudScale(vw: number, vh: number, uiScale: number): number {
  const k = Math.min(MAX, Math.max(MIN, Math.min(vw / W, vh / H)));
  return Math.round(k * uiScale * 100) / 100;
}

export function bindHudScale(root: HTMLElement, getUiScale: () => number): () => void {
  const apply = (): void => { root.style.setProperty('--hud-k', String(hudScale(innerWidth, innerHeight, getUiScale()))); };
  apply();
  addEventListener('resize', apply);
  return () => removeEventListener('resize', apply);
}
```
- [ ] **Step 4: Тест проходит** — `node --test test/ui-kit.test.ts` → pass.
- [ ] **Step 5: Перенести CSS кита.** `tokens.css` — из `lab/ui/kit/tokens.css`: блок общих токенов, блок `:root, [data-skin]`
  (h/w-пары), блок `:root, [data-skin='retro2']` (или выбранный в Task 0) и правила раздачи h/w по `.k-hud`/`.k-window`;
  `@font-face` не переносить. `kit.css` и `combat.css` — дословно; в начале `kit.css` добавить:

```css
/* масштаб всего интерфейса (client/ui/kit/scale.ts) */
#hud, #menus { zoom: var(--hud-k, 1); }
```
  Картинки в CSS кита (если есть `url(../img/...)`) заменить на переменные, которые задаёт `dom.ts` (`--k-coin-url` и т. п.).
- [ ] **Step 6: Иконки**

```ts
// client/ui/kit/icons.ts
// Иконки интерфейса (Codex imagegen, client/assets/ui/icons/PROVENANCE.md). Нет файла — ''.
const FILES = import.meta.glob('../../assets/ui/icons/*.webp', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;
const BY_ID = new Map<string, string>();
for (const [p, url] of Object.entries(FILES)) BY_ID.set(p.slice(p.lastIndexOf('/') + 1, -5), url);
export function uiIcon(id: string): string { return BY_ID.get(id) ?? ''; }
```
- [ ] **Step 7: DOM-помощники** — `client/ui/kit/dom.ts`: `h()`, `keyHtml()`, `coinHtml()` (через `ui/coin.ts COIN_HTML`),
  `iconImg()`, `meterHtml()` — разметка ровно как в `lab/ui/kit/KIT.md` §3 и «Версия 2».
- [ ] **Step 8: Звуки** — `client/ui/kit/sfx.ts` = `lab/ui/kit/sfx.js` на TS, но без своего `AudioContext`: `attach(kit)` берёт
  `ctx` и выход `ui` из `sound.kit` (`client/audio.ts:320`), `enabled` читает `settings.uiSounds`; в `settings.ts` поле
  `uiSounds: boolean` (по умолчанию `true`, нормализация как у соседних булевых); в `settings-panel.ts` строка
  «Звуки интерфейса» — «Тихие щелчки кнопок, вкладок и наград» в категории «Звук». Клики по `.k-btn/.k-tab/.k-close/.k-seg>button`
  озвучивает один делегированный обработчик на `#menus` и `#hud` (как `lab/ui/page/page.js`).
- [ ] **Step 9: Подключить** — `index.html`: `<html lang="ru" data-skin="retro2">`; `startup-game.ts`: импорты
  `./ui/kit/tokens.css`, `./ui/kit/kit.css`, `./ui/kit/combat.css` **до** `./styles.css`; `app.ts`: `bindHudScale(document.documentElement, () => this.settings.uiScale)`
  в конструкторе и `sfx.attach(this.sound.kit)` после первого жеста. В `client/ui/menu/settings-panel.ts:238` убрать
  `--ui-scale` (теперь `--hud-k`), в `client/ui/menu/menu.css:14,867,902-909` убрать `zoom: var(--ui-scale)`.
- [ ] **Step 10: Проверка** — `npm run check && npm test && npm run build`; запустить
  `PORT=3106 DATA_DIR=$(mktemp -d) FISH2=1 ISLE=1 node server/main.ts --dev`, headless-снимок площади 1440×900 и 2560×1440:
  интерфейс прежний, но крупнее на 2K; ошибок в консоли нет.
- [ ] **Step 11: Commit** — `git commit -m "ui: кит 2.0 в клиенте — токены, компоненты, иконки, масштаб, звуки"`

---

### Task 2: Оболочка площади — слоты, верх-центр, бейдж, чат-док, подсказка, эмоции

Эталон: сцены «Площадь» (`lab/ui/screens/plaza.js`: обычный экран, у стола, шторм, чат открыт, праздник), раздел «Сетка».

**Files:**
- Create: `client/ui/kit/slots.ts`, `client/ui/kit/topcenter.ts`, `client/ui/kit/badge.ts`
- Modify: `client/app.ts` (создание слотов, бейджа, менеджера), `client/ui/tokens.ts` (пилюля жетонов → бейдж),
  `client/ui/toasts.ts` + `client/ui/toastbig.css` (тосты кита), `client/chat.ts`, `client/ui/voice.ts` + `voice.css`
  (кнопка голоса внутри чат-дока НЛ), `client/lobby/hud.ts` (подсказка НЦ, эмоции НП, «дать пять», джекпот → герой,
  таймер аквапарка → событие), `client/lobby/storm.ts:99-107` (инлайн-стили → событие кита),
  `client/lobby/piratehud.ts` (баннер → событие), `client/ui/kickvote.ts|css` (голосование → событие с кнопками),
  `client/ui/linkbanner.ts|css` (связь → событие `--danger`), `client/styles.css` (удалить замещённые правила:
  `.tokens` 2077-2144, `.toasts` 2145-2200, `.lh-hint` 2487-2530, `.lh-emotes` 2531-2553, `.lh-ask` 4512-4595,
  `.lh-timer` 6016-6070, `.jackpot` 2912-2977, `.stats` 1226-1234 → `.k-faint` в ВЛ)
- Test: `test/ui-kit.test.ts`

**Interfaces:**
- Consumes: Task 1 (`h`, `uiIcon`, `keyHtml`, `meterHtml`, `sfx`).
- Produces:
  - `class HudSlots { root: HTMLElement; tl; tc; tr; bl; bc; br; c: HTMLElement; constructor(host: HTMLElement) }`
  - `type TcEvent = { key: string; prio: number; html: string; tone?: 'danger'|'good'|'special'; lamp?: boolean }`
  - `type TcToast = { key?: string; tone?: 'info'|'reward'|'warn'|'good'; icon: string; title: string; sub?: string; life?: number }`
  - `class TopCenterModel { show(e: TcEvent): void; hide(key: string): void; current(): TcEvent | null; toast(t: TcToast): void; toasts(): TcToast[]; expire(now: number): void }`
  - `class TopCenter { constructor(slot: HTMLElement); event(e: TcEvent): void; clear(key: string): void; toast(t: TcToast): void }`
  - Приоритеты: `PRIO = { vote: 90, link: 80, boss: 70, mode: 60, storm: 50, pirates: 50, timer: 40, info: 10 } as const`
  - `class Badge { constructor(slot: HTMLElement); set(nick: string, level: number, xpShare: number, tokens: number): void; pop(text: string, tone?: 'bad'|'xp'): void; levelUp(level: number): void }`

- [ ] **Step 1: Падающие тесты менеджера верх-центра**

```ts
// дописать в test/ui-kit.test.ts
import { TopCenterModel, PRIO } from '../client/ui/kit/topcenter.ts';

test('верх-центр: одна плашка — с самым высоким приоритетом', () => {
  const m = new TopCenterModel();
  m.show({ key: 'storm', prio: PRIO.storm, html: 'Шторм' });
  m.show({ key: 'vote', prio: PRIO.vote, html: 'Выгнать?' });
  assert.equal(m.current()?.key, 'vote');
  m.hide('vote');
  assert.equal(m.current()?.key, 'storm');
});

test('верх-центр: тостов не больше трёх, тот же ключ заменяет', () => {
  const m = new TopCenterModel();
  for (const t of ['a', 'b', 'c', 'd']) m.toast({ title: t, icon: '' });
  assert.deepEqual(m.toasts().map((t) => t.title), ['b', 'c', 'd']);
  m.toast({ key: 'tok', title: '+5', icon: '' });
  m.toast({ key: 'tok', title: '+12', icon: '' });
  assert.equal(m.toasts().filter((t) => t.key === 'tok').length, 1);
  assert.equal(m.toasts().at(-1)?.title, '+12');
});
```
- [ ] **Step 2: Запустить — падает.**
- [ ] **Step 3: Реализовать `TopCenterModel`** (чистый класс без DOM: `Map` событий, массив тостов с `until = now + (life ?? 4200)`,
  `expire(now)` убирает просроченные) и `TopCenter` (DOM: `.k-slot--tc` > одна `.k-event` + `.k-toasts`, анимации `.is-new/.is-out`,
  `sfx.play('toast')`, таймер на `expire`).
- [ ] **Step 4: Тесты проходят.**
- [ ] **Step 5: Слоты** — `HudSlots` создаёт в `#hud` `<div class="k-hud">` со слотами `.k-slot--tl|tc|tr|bl|bc|br|c` (как
  `lab/ui/kit/KIT.md` §2). Режимы монтируют свои части в слоты, а не `position:absolute` по экрану.
- [ ] **Step 6: Бейдж** — `Badge` в ВП: кольцо уровня (`--p` = доля опыта), ник, жетоны; `pop('+N')` вместо `.tok-pop`;
  `levelUp()` вместо искры `✦` из `app.ts:790-810` (кольцо + `k-pop--xp` + тост «Уровень N»). Уровень и жетоны больше нигде в HUD.
  Источник данных — то же, что сейчас у `ui/tokens.ts` и `ui/levelprogress.ts`.
- [ ] **Step 7: Перевести на менеджер** — тосты (`ui/toasts.ts`: API наружу прежнее, внутри `TopCenter.toast`), шторм, пираты,
  голосование (кнопки «За Y / Против N» внутри `.k-event-actions`), связь, таймер аквапарка, джекпот (`.k-hero` в центре).
  Удалить «сдвиги» тостов `:has(...)` в `styles.css:2161-2168`.
- [ ] **Step 8: Низ** — чат-док НЛ (`.k-chat`, голос `.k-voice` с клавишей V внутри, «Сейчас говорят» `.k-speaking`),
  подсказка НЦ `.k-prompt` (клавиша колпачком, монета, `--off` с причиной), «дать пять» — `.k-prompt` с полосой времени,
  эмоции НП — ряд `.k-tile` 1–6 с иконкой `emote` и клавишами. FPS/пинг — `.k-faint` в ВЛ, по-прежнему по настройке.
- [ ] **Step 9: Проверка** — check/test/build; сервер на 3106; снимки 1440×900: площадь, у стола, шторм (`/storm` в dev-чате,
  если есть, иначе дождаться), чат открыт, голосование (вдвоём), сравнить со сценами «Площадь» на странице.
- [ ] **Step 10: Commit** — `git commit -m "ui: оболочка площади — слоты, верх-центр, бейдж, чат-док, подсказка, эмоции"`

---

> После Task 2 ведущий режет ветки `ui/entry`, `ui/menu`, `ui/fishing`, `ui/farm`, `ui/fort`, `ui/modes` от `mode/ui`
> (по worktree на каждую, `node_modules` — симлинк). Порты: entry 3131, menu 3132, fishing 3133, farm 3134, fort 3135, modes 3136.
> Одновременно идут не больше трёх групп (нагрузка Mac); headless Chrome — по общему замку `<scratchpad>/ui/chrome.lock`.
> Каждая группа правит только свои файлы; в общих (`client/app.ts`, `client/styles.css`) — только свои строки, коротко.
> Нужна правка кита — пишет ведущему, сама кит не правит.

### Task 3: Вход — загрузка, логин, переходы, связь

Эталон: сцены «Вход и загрузка» (`lab/ui/screens/entry.js`): первая загрузка (авто/шаг 1/шаг 3/ошибка), логин (2 раскладки;
сохранённый ник/новый/занят/код/подключение/настройки), загрузка комнат (Крепость/Ферма/Подземелье: ждём, 3-2-1, ошибка),
экраны связи (нестабильно/переподключение/обновление/потеряна/выгнали/другое окно).

**Files:**
- Modify: `index.html:12-97` (первая загрузка: инлайн-CSS на тех же значениях `retro2`, без кита — он ещё не загружен),
  `client/startup.ts:91-116`, `client/app.ts:280-415,509-560,1270-1339` (логин, связь), `client/ui/transition.ts`,
  `client/ui/transition-art.ts` (HD-картины `client/assets/loading/hd/*`, ферма и Подземелье), `client/ui/transition.css`,
  `client/ui/linkbanner.*` (уже событие из Task 2), `client/styles.css:1674-2040,2259-2329,2447-2484,5818-5835,5902-5921`

**Interfaces:**
- Consumes: кит (Task 1), `TopCenter` (Task 2).
- Produces: ничего наружу; `transition-art.ts` экспортирует прежний API, но с HD-путями.

- [ ] **Step 1:** Первая загрузка — `index.html`: логотип, 4 шага прогресса, статус, «Обновить», ошибка — как сцена
  «Первая загрузка»; цвета/радиусы — копией значений `retro2` (инлайн), шрифт system-ui до загрузки Rubik.
- [ ] **Step 2:** Логин — разметка из `entry.js` (карточка, поле, «Играть» `.k-btn--go`, «Сейчас в игре: N», ссылки, код
  с другого устройства, настройки — `.k-window` с теми же строками `SettingsPanel`). Убрать дублирующую шпаргалку клавиш и
  мёртвые `.teams/.team-chip/.vs` (`styles.css:1735-1781`).
- [ ] **Step 3:** Переходы между комнатами — HD-картины из `client/assets/loading/hd/` (`hero-*.webp`, `cover.webp` + LQIP,
  `farm.webp`, `dungeon.webp`, `*-jelly.webp`), раскладка сцены «Загрузка комнаты», «Ждём: …» — в ВЦ событием, 3-2-1 — `.k-count`.
  Старые файлы `client/assets/loading/*.webp` не удалять до слияния (откат).
- [ ] **Step 4:** Связь — «Связь потеряна / Тебя выгнали / Ты зашёл в другом окне / Переподключаемся / Сервер обновляется» —
  одно окно `.k-window--sm` в `.k-scrim` по сцене «Связь»; «Связь нестабильна» — событие `--danger` в ВЦ.
- [ ] **Step 5: Проверка** — check/test/build; снимки: первая загрузка (троттлинг сети в CDP), логин (новый ник, сохранённый),
  переход в крепость и на ферму, «связь потеряна» (остановить сервер), 1440×900 и 2560×1440.
- [ ] **Step 6: Commit** — `git commit -m "ui: вход — загрузка, логин, переходы с HD-картинами, экраны связи"`

### Task 4: Меню Esc и «Кто где»

Эталон: сцены «Меню Esc» (Профиль/Обзор, Рекорды, Коллекция, Подарки и коды, Графика, Звук, Голос, Управление, Интерфейс,
Клавиши) и «Кто где» (Tab) в `lab/ui/screens/plaza.js`. Владелец: меню и Tab — «очень хорошо», раскладку не трогать.

**Files:**
- Modify: `client/ui/menu/menu.ts|css`, `client/ui/menu/settings-panel.ts`, `client/ui/menu/keys.ts`, `client/ui/menu/gift.ts`,
  `client/ui/profile.ts`, `client/ui/records.ts` (эмодзи → `uiIcon`), `client/ui/album.ts`, `client/ui/levelprogress.ts`,
  `client/ui/levels.css`, `client/ui/voicepanel.ts|css` (свой набор `.vp-*` → `.k-row/.k-switch/.k-seg/.k-slider`),
  `client/ui/online.ts|css`, `client/styles.css:2202-2258,2330-2444` (мёртвое)

- [ ] **Step 1:** Каркас меню — `.k-window.k-window--split` с `.k-win-side` (`.k-nav`) и `.k-win-main`; «Продолжить» `.k-btn--go`,
  «На набережную» `.k-btn--info`, «Выйти» `.k-btn--ghost`; вуаль «Кликни, чтобы играть» — `.k-panel` по сцене.
- [ ] **Step 2:** Разделы — строки `.k-row`; Голос — тем же набором (убрать `.vp-*` дубли); громкость игроков — одно место
  (Голос → «Кто в голосе»), в «Звук» — ссылка туда.
- [ ] **Step 3:** «Кто где» — `.k-online-row`, комнаты иконками `uiIcon`, «ПКМ — громкость» видимой строкой.
- [ ] **Step 4: Проверка** — снимки каждого раздела и Tab; мышью открыть/закрыть, переключить вкладки, сменить ползунок.
- [ ] **Step 5: Commit** — `git commit -m "ui: меню Esc и «Кто где» на ките"`

### Task 5: Рыбалка, лодки, остров, рулетка рыбака

Эталон: `lab/ui/screens/fishing.js` — подход, ждёшь поклёвку (idle/wait/rain/bite), вываживание, улов (новый/рекорд/сундук/
Посейдон), журнал J (все/баркас/остров/награды), Дед Семён (задания/лавка/продать/лодки), рюкзак I (рюкзак/лайвел),
своя лодка (штурвал/якорь), остров (туман/сезон/вываживание/улов). Инвентарь: `scratchpad/ui/inventory/B-fishing.md`.

**Files:**
- Modify: `client/lobby/fish2*.ts|css`, `client/lobby/fishbag.ts`, `client/lobby/fishnpcdialog.ts`, `client/lobby/fishabfx.*`,
  `client/ui/fishbook.ts`, `client/ui/fishrewards.ts`, `client/ui/fishstyle.css` (только окружение шкалы и окна),
  `client/boat/boatui.ts`, `client/boat/radiopanel.ts`, `client/boat/*.css`, `client/lobby/isle/*` (HUD),
  `client/lobby/roulettehud.ts`, `client/lobby/roulettelog.css`, `client/ui/mobile-fishing.css`, `client/styles.css:4596-5078`

- [ ] **Step 1:** HUD — карточка рыбалки в ВЛ (уровень `.k-ring--mode`, следующий перк, «Шансы сейчас» с легендой), плитки
  рюкзак/пиво/задание в ВП под бейджем (`.k-tiles`), подсказка НЦ с J, «Подсекай!» — `.k-prompt--urgent`.
- [ ] **Step 2:** Вываживание — рамка вокруг прежней шкалы (вид шкалы и `--tier-*` не трогать), «Прекратить» с X на краю.
- [ ] **Step 3:** Улов — карточка НП (1 «В рюкзак», F «Отпустить ×1,5», полоса выбора), сундук и Посейдон.
- [ ] **Step 4:** Окна — журнал, Семён (Игнат/Саня тем же окном), рюкзак+лайвел, лодки — `.k-window` по сценам; одна золотая
  кнопка покупки; причина «закрыто» красной строкой.
- [ ] **Step 5:** Лодка, радио, остров, рулетка рыбака — по сценам.
- [ ] **Step 6: Проверка** — `/go fish`-подобные dev-команды или подход к пирсу; снимки: ждёшь, поклёвка, вываживание, улов,
  журнал, Семён/лавка, рюкзак, своя лодка, остров. Шансы и цены совпадают с прежними (те же источники в `shared/`).
- [ ] **Step 7: Commit** — `git commit -m "ui: рыбалка, лодки и остров на ките"`

### Task 6: Ферма

Эталон: `lab/ui/screens/farm.js` — обычный экран (растёт/созрело/новичок), пояс семян (выбор/грабли/закрыто), Семечкин,
Дядюшка Гриб (день/касса полна/опыт за ресурсы), заказы (Фургон/доска), Хозяйство (улучшения/кладовая/убранство/достижения),
доска фермы (карта/у соседа), Древо разлома (скоро/цветёт/итог), новый уровень, «Набери лейку». Инвентарь: `C-farm-fort.md` §1.

**Files:**
- Modify: `client/farm/hud.ts`, `client/farm/bar.ts`, `client/farm/ui/*.ts|css` (каркас `FarmWin` `ui/common.ts:183-322` →
  `.k-window`), `client/farm/well.ts`, `client/farm/well/well.css` (только рамка вокруг поля мини-игры)

- [ ] **Step 1:** HUD — карточка фермы ВЛ (кольцо `.k-ring--mode`, «Ур. 6 откроет…», Фургон), плитки лейка/колодец/сумка/
  созрело в ВП, обучение — одна карточка, подсказка E с «12:40 → 10:08» и «+35 опыта».
- [ ] **Step 2:** Пояс семян НЦ (9 ячеек, 1–9, колесо, E сажает, Q — по одной/граблями) вместо окна посадки — если поведение
  посадки сейчас через окно, пояс открывает тот же выбор (логика в `farm/plant*.ts` не меняется, только вид и клавиши).
- [ ] **Step 3:** Окна — Семечкин, Гриб, заказы (одно окно с двумя вкладками), Хозяйство (4 вкладки), доска, новый уровень.
- [ ] **Step 4:** Древо — плашка события в ВЦ с фазами, тосты шишек, окно итога; «Набери лейку» — рамка кита.
- [ ] **Step 5: Проверка** — снимки: обычный экран, созрело, пояс семян, Гриб, заказы, Хозяйство (все вкладки), Древо, лейка.
- [ ] **Step 6: Commit** — `git commit -m "ui: ферма на ките"`

### Task 7: Крепость

Эталон: `lab/ui/screens/fort.js` — бой (волна/ворота трещат/голосование), сбор и передышка, лавка (открыта/мало денег/куплено),
ворота-кристалл-башни, босс (броня/ядро/Кракен), «повалили», Tab и итоги, первая игра. Инвентарь: `C-farm-fort.md` §2.

**Files:**
- Modify: `client/fort/ui/*.ts`, `client/fort/ui.css`, `client/fort/record.css`, `client/fort/match.ts` (тексты тревог → тосты ВЦ),
  `client/fort/ui/boss.ts`; общий с пейнтболом блок HUD в `client/styles.css:119-1223,6083-6247` — только правила `.fort-hud`

- [ ] **Step 1:** ВЛ — карточка крепости ≤ 240×110 (мини-карта 96, ворота/кристалл тонкими полосами); ВЦ — волна одной строкой
  с рядом врагов, тревоги — тостами (≤3), голосование «сдаться» — в событии; ВП — плитки золото/рекорд/команда.
- [ ] **Step 2:** Низ — панель бойца отдельными блоками (`.k-vitals`: здоровье, оружие по ячейкам, граната со счётчиком,
  патроны, рывок пилюлей), стрелки угроз `.k-edge`, прицел `.k-cross`, цифры урона `.k-float`.
- [ ] **Step 3:** Лавка (сбоку, не модальная), ворота/кристалл/башни, босс (полоса в событии, окно уязвимости, Кракен),
  «повалили», Tab, итоги, подсказки новичку — по сценам.
- [ ] **Step 4: Проверка** — `/go fort` (dev); снимки: волна, передышка, лавка, ремонт ворот, босс, повалили, итоги.
- [ ] **Step 5: Commit** — `git commit -m "ui: крепость на ките — компактный HUD, лавка, босс, итоги"`

### Task 8: Остальные режимы и общий верх у любимых экранов

Эталон: `lab/ui/screens/modes.js` — картинг, регата, пейнтбол, прятки, «Выше облаков», пираты, шторм, аквапарк, крысиные бега,
рулетка, «как есть + общий верх» (дурак, блэкджек, бильярд, Подземелье). Инвентарь: `D-modes-refs.md` часть 2.

**Files:**
- Modify: `client/race/hud.ts` + `styles.css:3729-4510`, `client/lobby/regattahud.ts|regatta.css`, `client/paintball/hud.ts`
  + `styles.css:119-1223,6083-6247` (кроме `.fort-hud`), `client/hide/hud.ts|hide.css`, `client/skilltest/hud.ts|skilltest.css`,
  `client/lobby/piratehud.ts|pirates.css`, `client/lobby/ratracehud.ts|ratrace.css`, `client/lobby/plane*.ts|plane.css`;
  у дурака/блэкджека/бильярда/Подземелья — только кнопки выхода/ставок на `.k-btn`, клавиши `.k-key`, их верх не конфликтует
  с бейджем ВП (сдвинуть свои правые панели под бейдж 44 px).

- [ ] **Step 1:** Общие для режимов детали на ките: карточка места (`mo-stand`), список (`mo-list`), счёт команд (`mo-score`),
  ленты, итоги (одна функция по образцу `results()` из `modes.js`) — в `client/ui/kit/modes.ts|css` (переносит ведущий из
  `lab/ui/screens/modes.css` по запросу группы).
- [ ] **Step 2:** Каждый режим — по своей сцене; иконки предметов картинга `kart-turbo/jam/bubble/clap`, пейнтбол `marker`.
- [ ] **Step 3:** Любимые экраны — проверить, что бейдж/чат-док/тосты ВЦ не налезают; их вид не менять.
- [ ] **Step 4: Проверка** — `/go race|regatta|paintball|hide|skill`; снимки каждого режима и итогов; дурак/блэкджек/бильярд/
  Подземелье — по одному снимку «как есть + общий верх».
- [ ] **Step 5: Commit** — `git commit -m "ui: режимы на ките, общий верх у карт, бильярда и Подземелья"`

### Task 9: Сборка патча, уборка, проверки, отчёт

**Files:**
- Create: `docs/ui.md`
- Modify: `docs/README.md` (строка карты: «Интерфейс — `client/ui/kit/`, `docs/ui.md`, эталон `lab/ui`»), `client/styles.css`
  (удалить осиротевшие правила), `client/assets/ui/icons/PROVENANCE.md` (уже есть)

- [ ] **Step 1:** Ведущий сливает `ui/*` в `mode/ui` по одной, после каждой — `npm run check && npm test && npm run build`.
- [ ] **Step 2:** Поиск остатков: `rg -n "--ui-scale|panel-strong|cream-2|🪙|🎣|📖" client` — заменить или обосновать.
- [ ] **Step 3:** Сборка под CSP: `tools/release/csp-proxy.mjs` + `tools/release/csp-check.mjs` (как в начале файлов).
- [ ] **Step 4:** Снимки главных состояний каждой группы с собранной версии (1440×900 и 2560×1440), телефон — запуск и одна
  площадь (не ломается). Замер `?debug` → `__opus.info()` на площади до/после (DOM-слой не должен менять отрисовки).
- [ ] **Step 5:** `docs/ui.md` — как пользоваться китом в игре (слоты, верх-центр, бейдж, компоненты, иконки, звук, масштаб).
- [ ] **Step 6:** Отчёт владельцу: что вошло, адрес `http://localhost:3106`, 3 снимка, что не проверено; вопрос «сливать в main?».
- [ ] **Step 7: Commit** — `git commit -m "ui: единый интерфейс 2.0 — сборка, уборка, документация"`

---

## Самопроверка плана

- Покрытие: вход ✓ (T3), площадь ✓ (T2), меню/Tab ✓ (T4), рыбалка/лодки/остров ✓ (T5), ферма ✓ (T6), крепость ✓ (T7),
  остальные режимы и любимые экраны ✓ (T8), иконки ✓ (T1 + во всех), звуки с выключателем ✓ (T1), HD-загрузки ✓ (T3),
  компактный HUD и отдельные блоки бойца ✓ (T2, T7, T8), вывески набережной — тред набережной по
  `docs/sign-tokens-retropark2.md` (не здесь).
- Имена: `hudScale/bindHudScale`, `TopCenterModel/TopCenter/PRIO`, `HudSlots`, `Badge`, `uiIcon`, `h/keyHtml/coinHtml/iconImg/meterHtml`,
  `sfx.play/attach/enabled` — одинаковы во всех задачах.
- Открытый вопрос владельцу: Task 0 (стиль для всего UI, пакет шрифта).
