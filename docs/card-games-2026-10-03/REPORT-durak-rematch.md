# Durak: repeat a game while seated

Implemented locally on 2026-10-03. No commit, deploy, server start, browser session, SSH, production data, profile schema, Store, fishing, fort or fight changes were made by this worker.

## Behavior

- The result phase immediately clears each human's prior readiness. Its existing eight-second display remains intact.
- A seated human can press the bottom action **Повторить партию** during the result, waiting phase or countdown. The existing `ready` action carries explicit opt-in; pressing **Отменить готовность** revokes it.
- Readiness supplied during the result survives the transition back to waiting. A new countdown starts only with at least two participants, at least one human, and every seated human ready.
- Chair IDs, seated player IDs and chair ownership remain unchanged between games. Completed hands, per-game player numbers, result, deadlines and bot scheduling are cleared; a fresh hand is delivered on the next deal.
- The large result becomes a compact summary in the waiting panel and remains until the next deal. The repeat action stays at the bottom; the waiting panel leaves space above it.
- Permanent bots remain available. Temporary replacement bots and absent human reservations expire after the result. Standing/disconnecting revokes readiness. Returning to a reserved result-phase chair requires fresh consent; an old connection cannot consent for the new slot.
- A spectator seated during a running game receives no turn in that game and must opt into the next one. Unauthorized slot actions are ignored.
- Durak remains the existing free, rewarded game. No stakes/debit/affordability policy was introduced; a player with few or no tokens is not charged for repeating. Settlement remains the existing single finish callback per completed game.

## Files and integration

| File | Change |
| --- | --- |
| `server/lobby/durak.ts` | Post-result readiness lifecycle, private hand reset, departure consent revocation, optional enabled-table guard |
| `client/lobby/durakhud.ts` | Repeat/cancel action, consent count/countdown, retained result summary |
| `client/lobby/durak.css` | Bounded bottom-action layout and short-height adjustment; imported by HUD |
| `client/lobby/durak3d.ts` | Optional enabled-table guard for cards, bots, deck label and sounds |
| `test/durak-rematch.test.ts` | Seven focused real-game/server state tests |
| `test/durakhall.test.ts` | Two completed games through Hub, preserved player action/chair, settlement and no automatic third game |

Root integration hooks:

```ts
new DurakHall(hooks, { deck: durakDeck, allowedTables: [0, 1] });
new DurakTables3D(world, sound, [0, 1]);
```

Both options default to the existing all-table behavior. Network table indexing remains stable with three entries; the disabled third Durak entry is empty. No `DurakAct`, `DurakTableView` or other message contract change is required. Root owns routing table index 2 to Blackjack and its environment/table signs.

## Verification

- First run of new rematch scenarios against the old implementation: four expected failures (old readiness remained true; result opt-in was ignored/lost) and one pre-existing cancellation path passed.
- `/opt/homebrew/bin/node --test test/durak-rematch.test.ts test/durakhall.test.ts test/durak.test.ts`: **31 passed, 0 failed**. This includes the existing engine test of 300 bot games and the new two-round Hub settlement flow.
- `/opt/homebrew/bin/node node_modules/typescript/bin/tsc --noEmit -p .`: initially passed after production changes. A later rerun during concurrent Blackjack development reported missing `shared/blackjack.ts` / `server/lobby/blackjack.ts` imports in `test/blackjack.test.ts` and cascading implicit-any errors. No Durak-file diagnostic was reported. Root must rerun once workers converge; the later whole-project result is not a passing gate.
- Source inspection confirmed no shared message, room, scene, economy, fishing, profile or Store edit by this worker.

## Remaining acceptance

Root coordinates the full suite/build and browser. Desktop visual/click acceptance and the short mobile compatibility check have **not** been performed by this worker. Verify the result → bottom repeat → countdown → fresh hand sequence, waiting-panel clearance above the button, cancel behavior, and table-2 separation. No real-device mobile verification is claimed.

The cached compact result belongs to the current seated HUD session. Leaving the chair or refreshing after the server's result phase returns to the standard ready panel; no persistent historical-result protocol was added.
