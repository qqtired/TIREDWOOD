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
  эмоции НП — пилюля «1–6 Эмоции» с иконкой `emote`, как на странице (сцена «Площадь»). FPS/пинг — `.k-faint` в ВЛ, по-прежнему по настройке.
- [ ] **Step 9: Проверка** — check/test/build; сервер на 3106; снимки 1440×900: площадь, у стола, шторм (`/storm` в dev-чате,
  если есть, иначе дождаться), чат открыт, голосование (вдвоём), сравнить со сценами «Площадь» на странице.
- [ ] **Step 10: Commit** — `git commit -m "ui: оболочка площади — слоты, верх-центр, бейдж, чат-док, подсказка, эмоции"`

---

> После Task 2 ведущий режет ветки `ui/entry`, `ui/menu`, `ui/fishing`, `ui/farm`, `ui/fort`, `ui/modes` от `mode/ui`
> (по worktree на каждую, `node_modules` — симлинк). Порты: entry 3131, menu 3132, fishing 3133, farm 3134, fort 3135, modes 3136.
> Одновременно идут не больше трёх групп (нагрузка Mac); headless Chrome — по общему замку `<scratchpad>/ui/chrome.lock`.
> Каждая группа правит только свои файлы; в общих (`client/app.ts`, `client/styles.css`) — только свои строки, коротко.
> Нужна правка кита — пишет ведущему, сама кит не правит.

