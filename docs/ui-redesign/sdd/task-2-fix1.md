# Task 2 — fix round 1 of 5 (review of 9b5d9db)

Spec ❌ (fixable), quality Approved. Fix everything below in ONE follow-up commit on mode/ui, re-run
`npm run check && npm test && npm run build`, re-take the affected snapshots (1440×900 and 2560×1440), and append a
«Fix round 1» section to task-2-report.md (what changed, file:line, test line, snapshot paths).

## Open findings (verbatim from the reviewer, controller rulings in **bold**)

**I1. Pirate raid panel collides with toasts.** `client/lobby/pirates.css:14-16` still puts `.pr-panel` at `top:70px`,
~430 px wide, centred, while `.k-slot--tc` starts at 16 px. Any toast during a raid lands on the panel; the wave banner
touches it. The old CSS shifted toasts to 292 px; both shifts were removed and nothing replaced them.
**Ruling: no overlap is allowed. Preferred: the panel lives in the top-centre flow (after the event/toast stack, so it
moves down when something is shown above it), kit look (`.k-plate`/kit tokens), compact per BRIEF table (≤ 440 wide).
If a slot child is impractical, position it below the stack by another reliable means — but prove no overlap with a
snapshot: raid + toast + wave banner at once.**

**I2. Link banner and kick vote now sit under the Esc menu.** `client/app.ts:241-244` moved `Toasts`, `LinkBanner`,
`KickVoteUi` from `#menus` (z 20; link banner z 30, kick vote z 24) into `#hud` (z 10). A player who pauses can't see
«Связь пропала — восстанавливаем»; the vote countdown and «выгнать ли тебя» text are hidden and mouse voting is
impossible with the menu open; «поверх игры и меню» was an explicit original design note.
**Ruling: restore «above the menu» for the kick vote, the link banner and toasts (as before Task 2). The top-centre
manager stays the single owner of top-centre — e.g. give the top-centre slot its own fixed layer above `#menus`
(pointer-events none on the layer, auto on its children; `--hud-k` zoom still applies). Check it does not cover the Esc
menu's own header/tabs at 1440×900 — snapshot: Esc menu open + vote + toast. Y/N and mouse clicks on the vote must work
with the menu open.**

**I3. Lab «праздник» scene only partly built** (`lab/ui/screens/plaza.js:222-231`).
- Missing `.k-hero--gold` «Уровень N!» with the tier line (new nick frame name + tier dot) — `client/app.ts:821-829`
  does only toast + badge pop + ring bump.
- Missing `.k-hero--win` «Маяк горит!» «Ты первый · +30 <coin>» — find where the client learns the lighthouse was lit
  during the storm (`client/lobby/storm.ts` and its server message) and show the hero there; only for the player who
  was first, others get the existing toast/event if any. If the client has no data for «first» / reward amount,
  show what the protocol gives (protocol and server must not change) and say so in the report.
- Storm door prompt lacks the lab's gold reward pill («до 30 <coin>») and `k-prompt--urgent` (`plaza.js:80`).
**Ruling: build all three as in the lab, via the top-centre manager's centre/hero kind (same as jackpot hero), with the
same lifetimes/priority logic. Lab governs.**

**I4. Hints only in `title`** (global constraint: mouse is captured, no tooltip-only info).
- `client/lobby/hud.ts:48` emote list only in `title`; Esc keys list `client/ui/menu/keys.ts:19` names only 1–4.
- `client/ui/kickvote.ts:137,152` rule «кик — если «за» больше N %» was a visible row, now `title`-only.
- `client/chat.ts:130` room name on chat icon; `client/ui/kit/badge.ts:48` XP % on the ring — `title`-only.
**Ruling: remove every new `title` that carries information. Emotes: keys list in Esc menu says «1–6 эмоции» (keep the
pill as in the lab). Kick rule: back as a visible tertiary sub-line (13–14 px) in the vote event. Room name and XP %:
drop the `title` (ring already shows progress; room name is not needed there).**

## Minor findings promoted into this round by the controller

**M1 (real bug).** `client/ui/toasts.ts:8-10,39`: the `'🏴‍☠️'` map key contains U+FE0F, but lookup strips U+FE0F
first → can never match. Emoji not in the map stay in the title next to the icon (e.g. `app.ts:641` shows the `rain`
icon plus «🎉»). **Fix the mapping (normalise keys the same way as input), strip any leading emoji from the title once
an icon is shown, and write raw invisible chars as `️` / `‍` escapes (M2). Add a node test for the mapping
(pirate flag key matches; unknown leading emoji is stripped).**

**M-a (2K overlap — the owner plays on a 2K monitor).** `.lobby-hud .wardrobe` is `top:66px` (`client/styles.css:2465-2468`)
and does not scale; the badge is `top:16px; height:44px` inside `zoom: var(--hud-k)`. At 1920×1080 (k=1.2) the badge
bottom is 72 px (6 px overlap), at 2560×1440 (k=1.6) 96 px (30 px overlap). Same for any lobby panel starting near 66 px.
**Fix: anything placed under the badge clears it at every k (e.g. `top: calc((16px + 44px + 10px) * var(--hud-k, 1))`
or move it into the kit's right column). Snapshot at 2560×1440 with the wardrobe open.**

**M-b (part).** `.touch .k-slot--bl` (`styles.css:2144`) dropped `env(safe-area-inset-top)` — restore safe-area insets
for touch slots. (The dead `mobile-fishing.css` rules are deferred to Task 5, do not touch.)

## Deferred (do NOT fix now; logged in the ledger)
M3 voice.css rgba, M4 reduced-motion for new .pz animations, M5 more tests, M6 DRY event-icon/meter markup, M7 dev
sandboxes chat input, M8 schedule/expire 20 ms window, M9 chime on every toast, M10 meter morph transition, M-c link
banner warn/down tones, M-d chat-hint margin with VOICE=0, M-e other modes' top-centre clashes (mode groups).
