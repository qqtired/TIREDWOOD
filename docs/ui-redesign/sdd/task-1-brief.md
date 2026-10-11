### Task 1: Кит в клиенте (токены, компоненты, иконки, масштаб, звуки)

**Files:**
- Create: `client/ui/kit/tokens.css`, `client/ui/kit/kit.css`, `client/ui/kit/combat.css`, `client/ui/kit/icons.ts`,
  `client/ui/kit/dom.ts`, `client/ui/kit/scale.ts`, `client/ui/kit/sfx.ts`, `test/ui-kit.test.ts`
- Modify: `index.html` (атрибут `data-skin="retro2"` на `<html>`), `client/startup-game.ts` (импорт CSS кита до `styles.css`),
  `client/settings.ts` (поле `uiSounds`), `client/ui/menu/settings-panel.ts` (переключатель), `client/app.ts` (`bindHudScale`, `sfx.attach`)

**Interfaces:**
- Produces:
  - `hudScale(vw: number, vh: number, uiScale: number, coarse?: boolean): number` (coarse — палец: MIN 0,6)
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
  assert.equal(hudScale(844, 390, 1, true), 0.6);
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
const MIN_TOUCH = 0.6;
const MAX = 1.6;

export function hudScale(vw: number, vh: number, uiScale: number, coarse = false): number {
  const k = Math.min(MAX, Math.max(coarse ? MIN_TOUCH : MIN, Math.min(vw / W, vh / H)));
  return Math.round(k * uiScale * 100) / 100;
}

export function bindHudScale(root: HTMLElement, getUiScale: () => number): () => void {
  const coarse = matchMedia('(pointer: coarse)');
  const apply = (): void => { root.style.setProperty('--hud-k', String(hudScale(innerWidth, innerHeight, getUiScale(), coarse.matches))); };
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
/* масштаб слоёв кита (client/ui/kit/scale.ts). #hud/#menus целиком НЕ зумить — уезжают детали в экранных пикселях */
.k-hud, .k-scrim { zoom: var(--hud-k, 1); }
/* детали, привязанные к точке на экране (урон, стрелки угроз, подписи над миром): без zoom, увеличиваются transform */
.k-world { position: absolute; inset: 0; pointer-events: none; }
/* позиционируется внешний элемент (left/top или transform: translate), а увеличивается только внутренняя обёртка —
   иначе scale растянет и сам сдвиг */
.k-world .k-world-in { transform-origin: center; scale: var(--hud-k, 1); }
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
  в конструкторе и `sfx.attach(this.sound.kit)` после первого жеста. `--ui-scale` в `client/ui/menu/settings-panel.ts:238` и `zoom: var(--ui-scale)` в `client/ui/menu/menu.css:14,867,902-909`
  оставить для старых экранов; `--hud-k` пишет только `scale.ts` (одна функция для `bindHudScale` и `applyInterface`).
- [ ] **Step 10: Проверка** — `npm run check && npm test && npm run build`; запустить
  `PORT=3106 DATA_DIR=$(mktemp -d) FISH2=1 ISLE=1 node server/main.ts --dev`, headless-снимок площади 1440×900 и 2560×1440:
  старый интерфейс прежний (zoom его не касается), пример окна кита в `.k-scrim` на 2K в 1,6 раза крупнее; ошибок в консоли нет.
- [ ] **Step 11: Commit** — `git commit -m "ui: кит 2.0 в клиенте — токены, компоненты, иконки, масштаб, звуки"`

---

