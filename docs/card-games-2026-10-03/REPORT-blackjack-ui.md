# Blackjack HUD and world table

Owned files: `client/lobby/blackjackhud.ts`, `client/lobby/blackjack.css`, `client/lobby/blackjack3d.ts`. No existing game files were edited by this worker. Directory is not a Git repository.

## Delivered behavior

- Compact bottom HUD keeps the 3D table visible. Stakes 10/20/50, explicit submit, server-approved hit/stand/double/split, visible extra cost for double/split, balance, dealer/player cards and totals, round timer, result and explicit repeat after the next betting window. No automatic stake or purchase retries.
- Result survives the transition to betting while seated; repeat uses the previous base stake, never the doubled/split total. The 8-second result window is respected.
- Pending latch blocks clicks and shortcuts until a newer server revision or explicit `blackjackError`. After five seconds it reports waiting, without unlocking or resending. Server revision and money checks remain authoritative.
- Player names and all dynamic strings use `textContent`; no dynamic HTML or inline event handlers. Native buttons, visible focus, rules disclosure and a native confirmation dialog for leaving an active round. Before dealing, standing up uses the server cancellation/refund contract; during play/dealer, exit warns that the current hand will finish.
- Separate green felt and gold ring above the existing physical table, `БЛЭКДЖЕК` identity, public dealer/player card instances and chair labels/totals. Full 52-face atlas plus back, generated locally on canvas. Dealer `-1` renders a back, and hidden dealer totals display `?`. No private game state is accepted.
- Six original chairs stay spatially aligned at angles 30 + 60 × chair; renderer has no collision or interaction mutation. The title/status billboard is shown while walking and hidden when seated; flat title and cards remain on the table.

## Exact integration API

```ts
const bjHud = new BlackjackHud(parent); // CSS imported by this module
const bj3d = new BlackjackTable3D(world.scene, 18, 11);
bjHud.onAct = (a, rev, amount) => net.send({ t: 'blackjack', table: 2, a, rev, amount });
bjHud.onLeave = () => standUpThroughExistingPath();

// On seating (chair is local 0..5; original global args remain 12..17):
bjHud.show(2, chair);
bj3d.setMe(2, chair);

// On public welcome/update:
bj3d.setView(v);
bjHud.setView(v, performance.now());
bjHud.setBalance(tokens);

// On explicit rejection:
bjHud.onError(message);

// Frame and keyboard:
bjHud.tick(performance.now());
bjHud.escape(); // existing Esc/E handling, only once per event
bjHud.onKey(event); // optional H/S/D/P; returns handled boolean

// Leaving:
bjHud.hide();
bj3d.setMe(-1, -1);

// World reset / disposal:
bj3d.reset();
bj3d.dispose();
```

HUD exposes `visible` and `locked`. `locked` applies only to an active stake in play/dealer. 3D exposes `view(): BlackjackView | null`. No 3D frame call is needed. Root owns pointer release/restoration and the seated camera. Avoid forwarding Escape to both `escape()` and `onKey()`.

## Verification and limits

Focused TypeScript check on the two new modules and their imports passed using Node 24 and TypeScript 7 with `--ignoreConfig --noEmit --strict --noUnusedLocals`; CSS import uses `vite/client` types. This does not prove rendered layout or user-visible integration.

Per worker scope, no server, browser, full build, full test gate, deployment, real data operation or Git commit was run. Root must verify desktop seating/camera/pointer lock, actions and rejection recovery, hidden-card rendering, timer/result/repeat, leave confirmation, HUD visibility, and a basic mobile layout. Shader compilation and actual card visibility require the root browser/WebGL smoke. Keyboard and real assistive-technology acceptance are unverified.
