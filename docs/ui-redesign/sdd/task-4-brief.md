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

