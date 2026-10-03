# Fisher shop UI

## Scope

Changed `client/lobby/fishnpcdialog.ts` and only NPC (`.fn-*`) rules in `client/lobby/fish2.css`. Blackjack files remain frozen for root integration. This directory has no Git repository; no commit or reset was performed.

## Result

- Native dialog now has a definite viewport-bounded height and three grid rows: header, `minmax(0, 1fr)` body, footer. The outer dialog clips overflow; only `.fn-body` scrolls. Header/close and footer/status stay outside the scrolling content.
- The close cross owns a 44px header column and receives initial focus. On narrow screens it remains in its own right column while title/balance occupy the left. A second `Закрыть` button remains in the footer. Both call the existing `close()` path.
- Short greeting scrolls with content. Level and current quest share a compact overview; supplies use two cards; rods use a two-by-two list of horizontal cards with 78px thumbnails instead of wide vertical image cards. Mobile collapses to a single rod column and narrower supply layouts.
- Original advanced/professional/master PNG assets and their URLs are preserved. No cropping or new assets, dependencies, or server APIs.
- Native modal focus containment, Escape/cancel/backdrop closing, game-input propagation guards, pending latch, five-second timeout, explicit retry wording, rejection feedback, confirmed beer handling and late-response reopening guard remain unchanged. Opening resets only UI body scroll to the top.
- Money/progress logic, prices, bonuses, request payloads, quest rewards and rod unlock rules were not changed. No purchases or data operations were executed.

## Verification

- Focused TypeScript check for `fishnpcdialog.ts` and its imports: passed with Node 24 / TypeScript 7, strict/noUnusedLocals/noEmit.
- Parsed final `fish2.css` with the installed PostCSS parser: passed (73 NPC-related rules).
- Independently inspected final dialog structure and unchanged request/state/close methods. Root-level children are header/body/footer; `status` stays in footer and rod buttons remain direct card children, preserving selected-state updates.

Desktop browser acceptance is pending root QA. Required smoke: at a normal desktop viewport and a short window, open seller, scroll body to bottom, confirm header cross remains visible/clickable, close/reopen, use Escape/footer close, inspect rod thumbnails/labels and disabled purchase states. Root should also check one basic narrow viewport. No browser/server/full-suite/build/production action was run by this worker; source/CSS checks do not prove rendered clipping, focus restoration, or layout.
