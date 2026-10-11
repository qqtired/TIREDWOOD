# Task 7 (fort) — fix round 1 of 5 (review of 97071ee)

Spec ❌ (small gaps), quality Approved. Work in /Users/tired/Desktop/game-opus-ui-fort on ui/fort.

**First:** `git merge --no-edit mode/ui` (brings the light HUD, commit 5b8a88b, and docs). Report any non-trivial conflict.
Then fix everything below in one commit (or a few), run `npm run check && npm test && npm run build`, re-take the main
snapshots WITH the light HUD (real game where possible: wave, break with boss coming, boss, down, shop, results, Tab;
1440×900 and two at 2560×1440) as `l-*`, and append «Fix round 1» to task-7-report.md.

## Important
**I1. Record tile wording.** `client/fort/ui/tiles.ts:153` writes «Ваш! 4 / первый»; `:155` «рекорд повторён / ещё волна!».
Lab has only «рекорд N / твой M», «бьём рекорд / ещё 1 волна», «рекорда нет / будет ваш». **Use the lab states; for a new
record use «рекорд 4 / ваш, первый» and «рекорд 13 / ваш, было 12»; for equalled — «рекорд N / повторили».** Check every
tile caption is meaningful Russian.

**I2. Boss bar without numbers.** Lab bar shows «1 628 / 2 200» (`lab/ui/screens/fort.js:436-459`; Kraken «1 860 / 3 000»).
**Derive the max from `shared/fortwaves.ts bossHp(wave, humans, tier)` with the values the client already has (no protocol
change); show «cur / max» with thin spaces as the lab. If any input is not reliably known on the client, keep percent and
explain exactly which in the report.**

**I3. Results → pause menu.** `match.ts:507` releases the pointer for the results window; when the next game starts
`hideEnd()` makes `wantsPointer` true and `app.ts:1164 watchPointer` opens the Esc menu 0.3 s later — on Esc AND on the
idle timer (every replay without «Ещё раз»). **Reuse the existing `freeCursor` / `FortPrompt.setResume` path («Обратно в
бой», `vitals.ts:163`): the new game shows the click-to-resume prompt, never the full Esc menu. Esc in results must not open
the menu either.** Verify in the browser both cases.

## Promoted Minor (visible to the player or cross-mode)
- **P1.** Stall overlaps the fighter panel at 1440×900 (p-shop: stall x≈1015/y≈851 vs «Shift рывок» block). Lab: the
  panel stays fully visible. Fix the stall placement.
- **P2.** `client/fort/hud.ts:69` `arms.setVisible` is a no-op → the fighter panel stays visible behind results and at
  death. Restore hiding where the old UI hid it (results, down if the lab hides it — follow the lab).
- **P3.** `coach.ts:82` appends the newbie card straight into `slots.tc`, outside TopCenter (doesn't count toward the 3-card
  cap, `clearToasts` doesn't remove it). Put the coach card where the lab puts it (if the lab shows it in top-centre, route
  it through TopCenter as an event/toast; otherwise its own slot). Also: no «Новый враг» toast for the basic walker /
  wave 1, and no fresh-enemy toasts while the coach card is showing.
- **P4.** `banners.ts:72-75 dropAll()` calls `top.clearToasts()` on fort exit — wipes non-fort toasts. Clear only fort
  keys/heroes (track all hero keys you showed, not just the last).
- **P5.** `coach.hide()` on exit calls `finish()` (`coach.ts:127`) → leaving mid-tip consumes the tip. Hide without
  advancing/saving.
- **P6.** Kraken stun-window bar dropped (`boss.ts:128`: only when `open && !v.status`, and `krakenInfo()` always returns a
  string). Brief lists «окно уязвимости, Кракен» — show the window bar for every open state as the lab; remove dead
  `openTicks` plumbing only if truly unused after this.
- **P7.** Down block duplicate wording (g-down: «Снова на террасу» + «встанешь на террасе»). One line, as the lab.
- **P8.** Tab header: add the lab's «общак волны N» pill; Tab level ring `board.ts:35` hard-coded `--p:1` — use real
  progress if the client has it, else drop the ring fill (no fake full rings).
- **P9.** Dead code: `hud.ts:71` `FortHud.card` shim, `index.ts:261` empty `onEvent`, `ui/dom.ts` `ARROW_SVG`/`replay`,
  `schedule.ts bossOfWave`, `match.ts:842,890` no-op `pb.killfeed` calls; `wave.ts:95-110 chips()` duplicates
  `wavecard.ts cardChips` — use one (the tested one); `hudK()` duplicated (`floaters.ts:30`, `ui/index.ts:88`) — one helper.

## Deferred (do NOT fix now)
Killfeed / teammate-down names (lab has none; boss kill hero survives); «Орда на N»; Esc → Клавиши «Крепость» row (menu
group owns keys.ts); `nickTone` copy; meter markup vs kit `meterHtml`; per-frame HTML rebuild of wave/boss plates; thin
tests; stand toasts truncation (stand only).
