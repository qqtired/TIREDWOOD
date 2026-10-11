# Task 3 (entry) — fix round 1 of 5 (review of 5b8a88b..867506f)

Spec ❌, quality not approved. Work in /Users/tired/Desktop/game-opus-ui-entry on ui/entry. Fix all below, run
`npm run check && npm test && npm run build`, then RE-SHOOT every state (all current shots are partly stale): boot (incl.
placeholder), login (new/saved/code/error/busy/settings) at 1440×900, 1280×720, 1440×700, 2560×1440; transitions + wait +
3-2-1 at 1440×900 and 2560×1440; link screens at 1440×900; one plaza shot WITH a hero banner («Уровень N!» via a dev
path or a client-side fake) to prove I1. One reused Chrome profile (disk is nearly full) → ~/.Trash at the end.
Append «Fix round 1» to task-3-report.md.

## Important
**I1. Hero banners pushed down in every room.** `client/ui/transition.ts:189` creates `.en-count-box` once in
`.k-slot--c` — the slot where `TopCenter.hero()` appends «Уровень N!», «Маяк горит!», «Джекпот!». `transition.css:357-366`
gives it `min-height:260px; width:720px; opacity:0`, so it always takes space: heroes land 135 px lower and the slot grows
to 720×317. **Fix: not in the layout when not shown (`display:none` unless `.show`, or create/remove in
showCount/hideCount, or absolute). Width as the lab (520).**

**I2. «Ждём: …» countdown bar broken.** `transition.ts:613` wraps the meter in `<div style="display:contents" data-mode>`;
the kit rule `kit.css:260` (`.k-event > .k-meter`) needs a direct child → a 32×6 stub under the icon. **Put `data-mode` on
the meter itself (hand-build the span), drop the wrapper and the inline style.** Also shorten the sub so it isn't cut by
the 440 px cap: «Начнём, как только загрузится».

**I3. Plates on login/loading pages — controller decision: follow the lab's light mode.** The owner chose «карточка
слева» while looking at the lab with the light HUD on: there the login card, tagline, news cards, keys, «Сейчас в игре»
pill, loading plate and tip bubble are all warm-white with dark text (reference render:
`/private/tmp/claude-501/-Users-tired-Desktop/56f6b8eb-2545-4e49-9c5b-d98b01077673/scratchpad/ui/rv3-work/lab-light-stage-entry-login.png`
and `…/lab-light-stage-entry-rooms.png`). Windows (`.k-window`, e.g. the link screens, quick settings if it is a window)
stay retro2 teal, exactly as the lab does. **Remove the hard-coded plate reset in `client/ui/entry.css:15-24`. Make the
page roots (boot overlay, login screen, room-loading screen) a HUD token context with a small ADDITIVE kit change: a class
(e.g. `.k-hudctx`) added to the HUD-context selector list in `client/ui/kit/tokens.css` (where `.k-hud, .k-plate, …,
.voice-hud` are listed) — tokens only, no zoom, no layout. List it under «Kit changes».** The inline first-load CSS in
`index.html` (before the kit loads) uses the same light values (copy from the light block) so there is no teal→white flash.
Check the result against the two lab renders.

## Promoted Minor
- **P1.** Login code cells: `maxlength=1` and `focus()` doesn't select (`client/ui/entry.ts:315,403`) → typing into a filled
  cell is ignored. Select the cell content on focus/click so typing replaces it.
- **P2.** Nick error: use `role="alert"` (or keep one live region and change only its text) so it's announced (`entry.ts:282`).
- **P3.** `hero-center.webp` is still emitted by the eager glob (`client/ui/transition-art.ts:9`) though the centred layout is
  dropped — exclude it.
- **P4.** Boot placeholder: the 48×27 LQIP shows blocky at 30× (the owner hates «шакальное»). Blur it (`filter: blur(…)`
  with a slight scale to hide edges) so it reads as a soft glow until the real art arrives.
- **P5.** Lobby flyover keeps rendering behind the opaque login art (`client/app.ts:1402 lobby.idle`). After the shader
  warm-up, stop or throttle it while the login art fully covers the screen (keep it where the world is visible, e.g. behind
  link windows). Keep the change small and local; if it's not safe, say why and leave it.
- **P6.** Revert the `.join-settings` deletion hunk in `client/ui/menu/menu.css` (the menu group edits right there; the
  lead removes dead CSS at the end).
- **P7.** `docs/README.md`: add `ui/entry.ts`, `ui/entry.css` to the shell/entry row (CLAUDE.md §8).

## Not a code fix (lead will ask the owner)
Art sharpness at 2560: sources are 1536 px (imagegen limit) → ×1.67 stretch. Leave as is; do not rename `hd/`.

## Deferred (do NOT fix)
QuickSettings duplicating settings-panel rows (lab parity); quick-settings focus move/return; `logoHtml` living in entry.ts
(move later to a logo module); `el` vs kit `h()`; linkbanner importing entry.css for `.en-spin`; boot logo font swap;
`fetchpriority` on the cover; nickCheck vs server stripping; thin tests.
