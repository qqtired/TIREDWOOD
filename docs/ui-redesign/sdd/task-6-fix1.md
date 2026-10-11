# Task 6 (farm) — fix round 1 of 5 (review of 01a10d7..eb29d61)

Spec ❌ (one dispatch rule), quality not approved (2 Important). Work in /Users/tired/Desktop/game-opus-ui-farm on ui/farm.
Fix all below in one commit, check/test/build, re-shoot the main states on the current branch (light HUD): normal, ripe,
belt, Гриб, заказы, Хозяйство (all tabs), Древо, лейка, у соседа — 1440×900 plus two at 2560×1440 — as `l-*`, append
«Fix round 1» to task-6-report.md. One reused Chrome profile → ~/.Trash at the end.

## Important
- **I1. Farm toasts not cleared on leaving the farm.** Keys are `farm*`-prefixed but nothing calls `clearToasts`
  (`client/farm/hud.ts:147-160` clears only hero `farm-level` and event `farm-tree`). Up to 4.2 s of «Продано»/«Созрело…»
  stay over the plaza and take stack slots. **Call `this.top.clearToasts('farm')` (prefix) in `FarmHud.setVisible(false)`
  and clear every farm hero key you show.** Never a bare `clearToasts()`.
- **I2. Seed-belt wheel has no accumulation/throttle** (`scene.ts:126-130` → `hud.ts:232` → `belt.ts:91-97`, `belt.ts:166`):
  a trackpad/Magic Mouse spins the 17-crop ring wildly. **Accumulate |deltaY| to ~80 per step (or throttle ~120 ms),
  same for the in-belt listener. And only take over the wheel while the belt is actually shown/active — camera zoom must keep
  working elsewhere at the farm** (today any empty bed in range steals the wheel).

## Promoted Minor
- **P1.** `board.ts:89` «Помочь» calls `this.close(true)` (silent) → `host.closed()` skipped, pointer never returned, no close
  sound. Use the normal close.
- **P2.** `scene.ts:327-334` ЛКМ plants instantly at up to 6 m with no picker (spends tokens, up to 9 beds with the rake).
  **ЛКМ only plants when the belt is already shown (first press/E shows it); a stray click must not spend tokens.**
- **P3.** `test/farm-ui.test.ts:16-20` `farmAt` xp table is wrong (passes by luck). Use `FARM_XP_TOTAL[level-1]`.
- **P4.** `ui/sys.ts:13` `+${g.xp} XP` → «+N опыта» like everywhere else.
- **P5.** `ui/tree.ts:69` hard-coded «до 01:00» → derive from `BOSS_END_HOUR` / the same source as the plate's `b.end`.
- **P6.** Хозяйство → Кладовая: match the lab's Кладовая tab exactly (`lab/ui/screens/farm.js`). If the lab lists what's in
  storage/the bag, list it (the old Кладовая did, `estate.ts:163 drawStore`); if the lab doesn't, leave it and say so.

## Deferred (do NOT fix)
«Подобрать шишку E» (cones by proximity), «ещё 22 из 30» counter, «В час ≈ N» on crop cards, tutorial ×, Фургон countdown in
the card, help prompt on an already-watered neighbour bed, hard-coded rgba shadows copied from the lab, per-frame
JSON.stringify in prompt, `role="img"` tile aria, levelup re-show on exit (pre-existing), thin tests for findHelp/tree/van.
