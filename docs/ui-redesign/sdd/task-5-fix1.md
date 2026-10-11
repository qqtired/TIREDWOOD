# Task 5 (fishing) — fix round 1 of 5 (review of 5b8a88b..ce2958c)

Spec ✅ with decisions, quality not approved (one Important). Work in /Users/tired/Desktop/game-opus-ui-fishing on ui/fishing.
Fix all below, `npm run check && npm test && npm run build`, re-take snapshots with the LIGHT HUD for everything touched
plus the states never seen on light (fish-idle, boat helm/anchor+radio, roulette bet/spin/win/lose, Семён boats) as `l-*`,
append «Fix round 1» to task-5-report.md. One reused Chrome profile (disk is nearly full); move it to ~/.Trash at the end.

## Important
**I1. Roulette not reset when leaving the lobby.** `LobbyScene.exit()` → `fish2.reset()` (`fish2hud.ts:609`) closes the
roulette dialog but never resets `RouletteHud`; `near`/`view` stay stale and the `setInterval` (`roulettehud.ts:140`) keeps
`renderRound()` (`:326`) → the `roulette` top-centre event and the gold `rl-tile` can stay in other scenes.
**Add `RouletteHud.reset()` (near=false, view=null, clear the event, hide the tile, reset heroKey, stop/idle the interval)
and call it from `Fish2Hud.reset()`. Verify: stand at the roulette, leave to another room, nothing of it remains.**

**I2. Barkas / island XP multipliers shown nowhere.** Old HUD showed «баркас · цена и опыт ×1,25» and «остров · опыт ×2»
(`BARKAS_XP`, `ISLE_XP`). **Add one short line in the fishing mode card (tl) when on the barkas or the island:
«баркас · цена и опыт ×1,25» / «остров · опыт ×2» (values from the shared constants, not hard-coded).** The equipped lure —
not needed in the HUD (Семён shows it).

## Controller decisions on the windows the owner said not to touch (lab look wins, function kept)
**D1. Journal «Награды».** The 4 picker rows replaced the lab's big art cells — a redesign of an approved window. **Keep the
lab look: big art cells as in the lab, 4 of them (удочка, поплавок, окно вываживания, значок), click a cell to choose
(picker in the same style as the lab window). No rows of small icons.**
**D2. Journal cards 4th line «сейчас N %» + its legend entry** — not in the approved lab card. **Remove both; cards exactly
as the lab.** (5 rod cards at Семён, the seller-reply footer `.fi-status`, ghost ferry buttons — keep, they are needed.)

## Promoted Minor
- **P1.** `.fi-tiles` (`fishprogresshud.ts:120`) stays as an empty flex item in the shared `tr` slot → extra gap under the
  badge in every scene. Hide it when all tiles are hidden (same `:not(:has(> :not([hidden])))` rule as boat/roulette rows).
- **P2.** Poseidon banner (`fishcard2.ts:275`) is a hand-made `.k-hero` in `slots.c` outside TopCenter's one-hero
  arbitration → can overlap «Уровень N!» / roulette heroes. Route it through `ui.top.hero(...)`.
- **P3.** Roulette lose banner is full size; lab uses `k-hero-title is-sm` («Улов ушёл в море…»). Add an optional
  `small?: boolean` to `TcHero` in `client/ui/kit/topcenter.ts` (additive; list it under «Kit changes») and use it.
- **P4.** Livewell tile hidden while driving (`fishprogresshud.ts:165`, `ctx = live && context`); the lab «за штурвалом»
  shows it. Show it at the helm.
- **P5.** Drink tile now visible only while the lobby scene is live; the old badge stayed visible in other rooms and on
  pause. Keep it visible in any room while the drink is active.
- **P6.** Tooltip-only info: boat nav tile full label «Бакен F2 → остров 2,1 км» only in `title` (`boatui.ts:154`); radio
  station name when closed only in `title` (`radiopanel.ts setChip`). Show visibly (short) or drop the `title`.
- **P7.** Ignat's «До сезона острова» wait line is gone — show it in Ignat's window as a status row when the island is closed.
- **P8.** Duplicate «Рыболовное событие» toast on login (`client/app.ts`) repeats the rain event plate — drop the toast when
  the event plate is shown (one short change in app.ts).
- **P9.** Dead code/CSS: `fishrelease.css` (dead, still imported at `fishcard2.ts:26`), `fishfmt.ts` `dartParts`,
  `oddsParts`, `levelPerks`, `levelPerkText`, `shopImg`, `fishrewards.ts:78 miniWindow` + `.frw-win*` CSS,
  `fishgame.ts:166 ReelGame.rainEl`, unused `hudRoot` fields (`radio.ts:47`, `ownboats.ts:51`) if removing them doesn't
  touch other groups' files. `.touch .fr-hint` 11 px (`fish2.css:697`) → ≥ 13 px. Six local `esc` copies → `escHtml` from
  `client/ui/kit/topcenter.ts`; `fishbook.ts:142` local `meterHtml` → kit `meterHtml` or rename.

## Deferred (do NOT fix)
«⚓+» both-zones mark, `r.note` in the journal, «Потолок» odds explanation, «До сезона» only within 30 min, reel breakdown
lines; untracked timers/listeners (single instance); phone catch card covering touch buttons; thin tests; `.fh-chip` old style.
