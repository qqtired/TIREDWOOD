# Fishing rules — final approved32 state with completed30 baseline

Final approved32 state: typical clear fish sale 20.717844/min (+53.8582% versus release6), event 28.537762/min (+37.7448% versus clear).32 owned tests pass; strict owned TypeScript7 exit0. Runtime files frozen; desktop/mobile/release acceptance stays with root.

Scope: added `shared/fishing.ts` append-only species plus `shared/fishrules.ts`, `shared/fishreel.ts`, new `shared/fishprogress.ts`, fishing bot and owned rules tests. No persistence, protocol, map, UI, deployment or real-save changes.

## Completed API checkpoint

The entire `FishProgress`/`FishCastMods` API in `CONTRACTS.md` exists. Additional exact signatures:

```ts
// shared/fishprogress.ts
fishCatchXp(sp: number, perfect = false): number
// shared/fishrules.ts
reelStyleFor(sp: number, mods?: Readonly<FishCastMods>): ReelStyle
rollCatch2(rain: boolean, rand: () => number, mods?: Readonly<FishCastMods>): Hooked
fishPrice2(sp: number, g: number, coins = 0, mods?: Readonly<FishCastMods>): number
biteShare(sp: number, rain: boolean, mods?: Readonly<FishCastMods>): number
```

`Reel.perfect: boolean` is true initially and becomes false after the first tick outside the zone. Server replay computes this independently of message frequency. Snapshotted `FishCastMods` have no clock-dependent behavior after construction.

Levels use the Stardew cumulative thresholds 100, 380, 770, 1300, 2150, 3300, 4800, 6900, 10000, 15000. [Source: Stardew Valley Fishing](https://stardewvalleywiki.com/Fishing#Experience_Points). Level0 is the novice; level10 caps bonuses while further XP remains safe. Pure normalization floors valid counters, rejects nonfinite/negative values, and prevents unearned/fractional rods.

Each level gives zone×(1+.025×level) and the same relative rare-fish weight increase. A selected rod independently gives zone×(1+bonus) and bite rate×(1+bonus), with bonuses .1/.2/.3 at quests1/5/10. Level changes no other reel parameter. Beer lasts600000ms, costs15, increases rare-fish weights by20% and rounds fish sale×1.1; it never multiplies a chest. Rain drum price500. Server owns purchases, claims and catch counting.

## Baseline reproduced

Source: preserved release-6 source baseline. Node24, deterministic `fishIncome(TYPICAL,false,300)` reproduced fish-only13.465547009661105/min, chest4.478372098722762 separate, 2.263351265 fish/min. Typical rain16.994680233920597; expert clear18.23402639148296.

The +50% target is **novice level0, rod0, no beer, no discovery bonuses, no quests, no chests**:20.1983205145/min. Common sale is `round(oldIntegerSale*1.75)` using the original13.5/13.7 conversion and original weights. Examples: old2→4,3→5,4→7,5→9. No global×1.5 is applied on top of that.

Required repeatable quest claims pay exactly5 coins per counted fish over completed cycles. Consequently base+claimed quests must be reported separately from the +50% base calibration.

## Completed 30-species balance checkpoint

Meaningful red behavior tests demonstrated all missing progression/modifier features, old common price2 versus required4, old income13.465547 versus20.198321, and a real rarity inversion:600-seed typical seabass cost1296.3 reel ticks per success versus easier tuna1222.1.

Difficulty is measured as failure probability and **sum of all successful/failed reel ticks divided by successful catches**. Mean reel duration alone is not a difficulty score: early failures shorten it. Both typical and expert models use deterministic server reel simulations; all30 species must pass strict nonoverlapping cost bands.

Final30:27 owned behavioral tests passed,0failed,0skipped. Strict TypeScript7 check of all8 owned source/test files with project-equivalent flags and --ignoreConfig exited0. Source diffs independently inspected. Actual typical clear fish-only20.197887505335476/min (+49.9968%), event24.315381785723297, expert clear24.087627601488926. Chest4.599316579035137 separate; actual2.3782928145939386 fish/min and86.98184270779134XP/min. Full claimed quest cycles would add11.891464072969693/min, giving32.08935157830517 fish+quest/min before chests/discoveries. No automatic progression or NPC travel is modeled in these fixed snapshots.

The noncommon value conversion multiplier is1.076. Common integer×1.75 is separate, not compounded with a global×1.5. Pure beer sale-only with rare weighting held at1 measured22.266427/min (+10.2414% due integer rounding); full beer gives23.213775/min because its rare weighting also changes catches. Chest/junk contents and probabilities remain exact.

Actual difficulty is total simulated reel ticks divided by successful reels, rounded0.1tick in FishRule.difficulty.1200 identical seeds/species/model before and after calibrate it; tests reproduce every number. Both typical/expert pass strict rarity cost bands using600 seeds in each of two batches, including independent1000003+sp*1543 seeds. Early failures are included, not discarded or treated as shorter/easier fights.

High-tier spd/dartSpd/sharp are×.8; base zones/drain stay original. Rare movement is×.85 to maintain bands after high-tier easing; eel×.8; scorpion darts10→9, dogfish8→10, turbot10→8. All other existing patterns/ranges/hover/turn behavior stay original. Effective success/effort changes are nonlinear;20% motion easing does not mean exactly20% fewer retries.

XP follows normal-quality floor(3+SDdifficulty/3), then floor(perfect×2.4), then legendary/myth×5. The game's measured cost maps to Stardew scale via clamp(5,110,round(30+100*(1-300/difficulty))). No grade or simultaneous chest exists; trash/chest/legacy goldfish/failed reels earn0. This is an explicit adaptation, not a claim of species-for-species Stardew data. Tuna34→170, perfect34→81→405 (not408); myth195/perfect465. Fixed novice XP would extrapolate172.45minutes to15000, but actual progression changes zone/rod/weights and no identical real-time pace with Stardew is claimed.

Existing income checks were changed from12–15 to requested20.2 and tightened to±1%. Price category means remain monotonic; old×2 gaps were intentionally removed because requested common+75 changes them. Myth's old success ceiling was updated for required motion easing while actual relative rarity cost checks became stricter. All event-only availability, chest band/draw, collection and replay checks remain.

Verification command: `/opt/homebrew/bin/node --test test/fishing2.test.ts test/fishprogress.test.ts test/fishmods.test.ts test/fishbalance.test.ts`.

`BALANCE-fishing-rules.json` preserves complete30-species before/after metrics and isolated level/rod/beer/event income rates. Desktop/mobile/browser, full project gates, persistence and exact NPC claims are reserved for root/server workers. No server/browser/deployment/real-save activity by this worker.

## Approved32 extension

Parent relayed Roman's additional approved request: append exactly two real marine event-only species, one legendary/one mythical, plus literal unique-event common within32. Existing picarel (Смарида) becomes event-only common, retaining its style and base+75% common sale. New IDs append without shifting any existing ID: bluemarlin / Синий марлин / Atlantic blue marlin / Makaira nigricans /Legend and greenlandshark / Гренландская акула / Somniosus microcephalus /Myth. NOAA/ITIS verify real species; event placement and reel strength are game design, not a claim they naturally coexist at a Black Sea pier.

Sources: [NOAA blue marlin](https://www.fisheries.noaa.gov/species/pacific-blue-marlin), [ITIS Atlantic blue marlin](https://www.itis.gov/servlet/SingleRpt/SingleRpt?search_topic=Scientific_Name&search_value=Makaira+nigricans), [NOAA Greenland shark](https://repository.library.noaa.gov/view/noaa/8714/noaa_8714_DS1.pdf), [NOAA observed Greenland shark](https://oceanexplorer.noaa.gov/multimedia/video-playlist-ex1304-greenlandshark/).

The final32 measured table and benchmarks are below. The completed30 checkpoint is retained as evidence for the earlier stage.

## Completed30 same-seed per-species evidence

Success% and expected reel seconds per successful fish count all failed attempts. Income above additionally includes cast/wait/card times.1200seeds/model/species.

|Species|Tier|Sale range before→after|Typical success% before→after|Typical effort sec before→after|Expert success% before→after|Expert effort sec before→after|XP/perfectXP|
|---|---|---:|---:|---:|---:|---:|---:|
| Хамса (hamsa) | Обычные | 2–3→4–5 | 100.00→100.00 | 5.81→5.81 | 100.00→100.00 | 5.34→5.34 | 17/40 |
| Бычок (goby) | Обычные | 2–4→4–7 | 100.00→100.00 | 5.44→5.44 | 100.00→100.00 | 5.10→5.10 | 15/36 |
| Ставрида (scad) | Обычные | 2–5→4–9 | 100.00→100.00 | 5.73→5.73 | 100.00→100.00 | 5.23→5.23 | 17/40 |
| Барабуля (redmullet) | Обычные | 2–5→4–9 | 100.00→100.00 | 5.51→5.51 | 100.00→100.00 | 5.09→5.09 | 16/38 |
| Зеленушка (wrasse) | Обычные | 2–4→4–7 | 100.00→100.00 | 5.59→5.59 | 100.00→100.00 | 5.16→5.16 | 16/38 |
| Ласкирь (karas) | Обычные | 2–4→4–7 | 100.00→100.00 | 5.49→5.49 | 100.00→100.00 | 5.10→5.10 | 16/38 |
| Морская собачка (blenny) | Обычные | 2–3→4–5 | 100.00→100.00 | 5.49→5.49 | 100.00→100.00 | 5.15→5.15 | 16/38 |
| Сардина (sardine) | Обычные | 2–3→4–5 | 100.00→100.00 | 5.84→5.84 | 100.00→100.00 | 5.30→5.30 | 17/40 |
| Мерланг (whiting) | Обычные | 2–5→4–9 | 100.00→100.00 | 5.48→5.48 | 100.00→100.00 | 5.10→5.10 | 16/38 |
| Смарида (picarel) | Обычные | 2–3→4–5 | 100.00→100.00 | 5.82→5.82 | 100.00→100.00 | 5.28→5.28 | 17/40 |
| Кефаль (mullet) | Редкие | 4–12→4–13 | 94.92→96.58 | 9.22→7.94 | 96.67→97.67 | 7.04→6.30 | 25/60 |
| Скумбрия (mackerel) | Редкие | 4–10→4–11 | 96.83→97.58 | 9.80→7.87 | 99.00→99.42 | 6.79→6.11 | 25/60 |
| Сарган (garfish) | Редкие | 4–10→4–11 | 95.92→97.67 | 11.19→8.92 | 99.33→99.42 | 7.61→6.56 | 27/64 |
| Морской ёрш (scorpion) | Редкие | 5–12→5–13 | 95.17→95.83 | 8.66→8.23 | 98.33→98.92 | 7.01→6.70 | 26/62 |
| Камбала (flounder) | Редкие | 5–13→5–14 | 97.25→97.17 | 7.85→7.36 | 99.25→99.75 | 6.38→6.17 | 23/55 |
| Морской петух (gurnard) | Редкие | 5–12→5–13 | 95.33→96.08 | 8.59→8.07 | 98.42→99.00 | 7.10→6.69 | 25/60 |
| Угорь (eel) | Редкие | 7–19→8–21 | 94.58→97.33 | 10.75→8.42 | 97.92→99.08 | 8.20→6.75 | 26/62 |
| Горбыль (meagre) | Редкие | 7–19→8–21 | 95.58→97.00 | 8.60→7.69 | 98.00→98.67 | 6.67→6.23 | 24/57 |
| Черноморская сельдь (shad) | Редкие | 6–15→6–16 | 93.33→96.25 | 11.69→8.99 | 97.42→98.67 | 8.38→6.71 | 27/64 |
| Луфарь (bluefish) | Эпические | 10–26→11–28 | 77.17→90.92 | 18.68→10.40 | 93.33→97.08 | 9.76→7.26 | 30/72 |
| Катран (dogfish) | Эпические | 11–28→12–30 | 76.17→89.08 | 18.51→11.03 | 93.25→94.83 | 9.58→7.46 | 31/74 |
| Скат (ray) | Эпические | 11–28→12–30 | 77.92→89.33 | 15.16→10.31 | 92.83→96.33 | 8.84→7.31 | 30/72 |
| Калкан (turbot) | Эпические | 13–32→14–34 | 72.33→85.92 | 17.75→11.30 | 90.42→96.17 | 10.41→8.04 | 31/74 |
| Лаврак (seabass) | Эпические | 16–41→17–45 | 70.83→89.58 | 20.74→11.08 | 92.92→94.92 | 9.29→7.31 | 31/74 |
| Лихия (leerfish) | Эпические | 19–47→21–51 | 72.92→89.50 | 20.08→10.74 | 94.00→96.75 | 9.17→7.32 | 30/72 |
| Осётр (sturgeon) | Легендарные | 35–103→38–111 | 43.00→61.75 | 25.27→15.04 | 73.83→81.67 | 12.79→9.75 | 175/420 |
| Голубой тунец (tuna) | Легендарные | 39–108→42–117 | 49.25→66.92 | 20.60→13.92 | 78.67→85.25 | 9.94→8.41 | 170/405 |
| Меч-рыба (swordfish) | Легендарные | 39–108→42–117 | 46.58→65.42 | 22.81→14.92 | 80.83→88.75 | 10.45→8.57 | 175/420 |
| Морской чёрт (angler) | Легендарные | 32–94→34–101 | 44.83→59.00 | 22.74→16.02 | 74.58→80.33 | 11.58→10.14 | 180/430 |
| Большая белая акула (whiteshark) | Мифическая | 197–394→212–424 | 12.17→36.25 | 65.25→23.22 | 56.50→68.92 | 15.15→11.86 | 195/465 |

## Completed30 isolated modifiers

Fixed snapshots, gross fish sale excluding costs/chests/discovery/quest claims; XP0 with earned rods deliberately isolates rod effect. Quest column assumes completed claimed cycles; not automatic leveling or NPC travel.

|Snapshot|Zone factor|Bite factor|Rare weight|Sale factor|Clear fish coins/min|Event fish coins/min|Clear XP/min|Potential quest coins/min|
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| noviceBeer | 1 | 1 | 1.2 | 1.1 | 23.213775 | 27.858531 | 88.189150 | 11.783350 |
| level1 | 1.025 | 1 | 1.025 | 1 | 20.748707 | 24.891798 | 89.383454 | 11.960878 |
| level10 | 1.25 | 1 | 1.25 | 1 | 24.668036 | 28.972755 | 108.648554 | 12.434972 |
| advanced | 1.1 | 1.1 | 1 | 1 | 22.866560 | 27.250541 | 101.158112 | 12.877532 |
| professional | 1.2 | 1.2 | 1 | 1 | 25.167578 | 29.835897 | 113.654820 | 13.786703 |
| master | 1.3 | 1.3 | 1 | 1 | 27.365510 | 32.289248 | 126.698157 | 14.625665 |
| max | 1.625 | 1.3 | 1.25 | 1 | 32.032764 | 36.916129 | 152.155928 | 15.060067 |
| maxBeer | 1.625 | 1.3 | 1.5 | 1.1 | 37.225752 | 42.458711 | 156.125934 | 15.022201 |

## Final approved32 implementation and economy

Exactly two real new species appended at immutable indices34/35: blue marlin (Makaira nigricans, legendary) and Greenland shark (Somniosus microcephalus, mythical). Collection now requires32/32; old30 and31 are insufficient. Legacy goldfish/junk/chest remain outside the collection.

Picarel (Смарида) is now the event-only common as specifically approved, with unchanged movement and base common sale. Old integer2→common4→event6; old3→common5→event8. Its weight changes55→180 and its availability changes to event-only. Existing event rare/epic weights double (70/65/75/55/50→140/130/150/110/100). All30 previously balanced movement objects are byte-equivalent by deep equality. Original normal weights of remaining standard species and sale value/coefficient1.076 stay unchanged.

Unique pool now contains allfive rarity tiers: picarel common, eel/meagre/shad rare, seabass/leerfish epic, bluemarlin legendary, greenlandshark mythical. No unique fish can roll in clear weather even with strongest level/beer rare modifier. New eventLegend weight20 and Myth3 are lower than event rare/epic weights; Greenland is rarest among all fish. Conditional fish probabilities without buffs are marlin1.124859% and Greenland0.168729%; chest/junk chance stays3%/4.5%.

New base values are Legend45–125 and Myth220–480; both receive the SAME1.5 event factor through the common species sale path, with no species-specific reduction. Sale ranges are72–199 and350–763. New myth is highest measured difficulty: typical27.6667% success/28.4097 reel seconds per success, expert57.8333%/13.3525seconds. Legendary marlin is67.4167%/14.6658seconds typical,87.4167%/8.5346seconds expert; both are skill-catchable and remain in their strict rarity bands.

The requested +50% novice sale target remains 20.198321/min. After the approved removal of a cheap common from clear-weather availability, clear 20.717844 is 2.5721% above that target, or +53.8582% over actual release6. Parent explicitly accepted this within5% corridor instead of changing already-balanced prices or optimizing rounding again. Event 28.537762 is 37.7448% more profitable than clear through unique fish weights/rewards; cast/bite frequency is unchanged by event.

Final novice metrics: chest 4.589999/min separate, fish 2.368138/min, XP 87.867759/min. Event chest 4.479150/min, fish 2.300018/min. Expert clear sale 24.817459/min; expert event 33.693137/min. Over completed claimed quest cycles, novice potential quest income is 11.840691/min; base+quest 32.558535/min before chest/discovery. These fixed snapshots exclude NPC travel, purchase costs and automatic level/rod growth.

Final sale-only beer (rare weighting held at1) 22.863961/min, +10.3588%; per-catch round(base*1.1) accounts for the difference from exact10%. Full beer also changes rare weights, so gross effect can be larger.

|Model|Tier|Expected reel sec per success|Landed percent|
|---|---|---:|---:|
| typical | Обычные | 5.441–5.843 | 100.00–100.00 |
| typical | Редкие | 7.363–8.992 | 95.83–97.67 |
| typical | Эпические | 10.310–11.297 | 85.92–90.92 |
| typical | Легендарные | 13.923–16.016 | 59.00–67.42 |
| typical | Мифическая | 23.224–28.410 | 27.67–36.25 |
| expert | Обычные | 5.091–5.336 | 100.00–100.00 |
| expert | Редкие | 6.114–6.754 | 97.67–99.75 |
| expert | Эпические | 7.260–8.041 | 94.83–97.08 |
| expert | Легендарные | 8.409–10.142 | 80.33–88.75 |
| expert | Мифическая | 11.861–13.352 | 57.83–68.92 |

## Final32 same-seed difficulty/price evidence

1200real reel simulations/species/model; before refers to release6 for original30. New species have no invented before result. Failure probability is1-success%. Full raw durations/styles/seeds are preserved in BALANCE-fishing-rules-32.json.

|Species|Tier|Availability|Sale before→after|Typical success% before→after|Typical effort sec before→after|Expert success% before→after|Expert effort sec before→after|XP/perfectXP|
|---|---|---|---:|---:|---:|---:|---:|---:|
| Хамса (hamsa) | Обычные | standard | 2–3→4–5 | 100.00→100.00 | 5.81→5.81 | 100.00→100.00 | 5.34→5.34 | 17/40 |
| Бычок (goby) | Обычные | standard | 2–4→4–7 | 100.00→100.00 | 5.44→5.44 | 100.00→100.00 | 5.10→5.10 | 15/36 |
| Ставрида (scad) | Обычные | standard | 2–5→4–9 | 100.00→100.00 | 5.73→5.73 | 100.00→100.00 | 5.23→5.23 | 17/40 |
| Барабуля (redmullet) | Обычные | standard | 2–5→4–9 | 100.00→100.00 | 5.51→5.51 | 100.00→100.00 | 5.09→5.09 | 16/38 |
| Зеленушка (wrasse) | Обычные | standard | 2–4→4–7 | 100.00→100.00 | 5.59→5.59 | 100.00→100.00 | 5.16→5.16 | 16/38 |
| Ласкирь (karas) | Обычные | standard | 2–4→4–7 | 100.00→100.00 | 5.49→5.49 | 100.00→100.00 | 5.10→5.10 | 16/38 |
| Морская собачка (blenny) | Обычные | standard | 2–3→4–5 | 100.00→100.00 | 5.49→5.49 | 100.00→100.00 | 5.15→5.15 | 16/38 |
| Сардина (sardine) | Обычные | standard | 2–3→4–5 | 100.00→100.00 | 5.84→5.84 | 100.00→100.00 | 5.30→5.30 | 17/40 |
| Мерланг (whiting) | Обычные | standard | 2–5→4–9 | 100.00→100.00 | 5.48→5.48 | 100.00→100.00 | 5.10→5.10 | 16/38 |
| Смарида (picarel) | Обычные | event-only | 2–3→6–8 | 100.00→100.00 | 5.82→5.82 | 100.00→100.00 | 5.28→5.28 | 17/40 |
| Кефаль (mullet) | Редкие | standard | 4–12→4–13 | 94.92→96.58 | 9.22→7.94 | 96.67→97.67 | 7.04→6.30 | 25/60 |
| Скумбрия (mackerel) | Редкие | standard | 4–10→4–11 | 96.83→97.58 | 9.80→7.87 | 99.00→99.42 | 6.79→6.11 | 25/60 |
| Сарган (garfish) | Редкие | standard | 4–10→4–11 | 95.92→97.67 | 11.19→8.92 | 99.33→99.42 | 7.61→6.56 | 27/64 |
| Морской ёрш (scorpion) | Редкие | standard | 5–12→5–13 | 95.17→95.83 | 8.66→8.23 | 98.33→98.92 | 7.01→6.70 | 26/62 |
| Камбала (flounder) | Редкие | standard | 5–13→5–14 | 97.25→97.17 | 7.85→7.36 | 99.25→99.75 | 6.38→6.17 | 23/55 |
| Морской петух (gurnard) | Редкие | standard | 5–12→5–13 | 95.33→96.08 | 8.59→8.07 | 98.42→99.00 | 7.10→6.69 | 25/60 |
| Угорь (eel) | Редкие | event-only | 7–19→8–21 | 94.58→97.33 | 10.75→8.42 | 97.92→99.08 | 8.20→6.75 | 26/62 |
| Горбыль (meagre) | Редкие | event-only | 7–19→8–21 | 95.58→97.00 | 8.60→7.69 | 98.00→98.67 | 6.67→6.23 | 24/57 |
| Черноморская сельдь (shad) | Редкие | event-only | 6–15→6–16 | 93.33→96.25 | 11.69→8.99 | 97.42→98.67 | 8.38→6.71 | 27/64 |
| Луфарь (bluefish) | Эпические | standard | 10–26→11–28 | 77.17→90.92 | 18.68→10.40 | 93.33→97.08 | 9.76→7.26 | 30/72 |
| Катран (dogfish) | Эпические | standard | 11–28→12–30 | 76.17→89.08 | 18.51→11.03 | 93.25→94.83 | 9.58→7.46 | 31/74 |
| Скат (ray) | Эпические | standard | 11–28→12–30 | 77.92→89.33 | 15.16→10.31 | 92.83→96.33 | 8.84→7.31 | 30/72 |
| Калкан (turbot) | Эпические | standard | 13–32→14–34 | 72.33→85.92 | 17.75→11.30 | 90.42→96.17 | 10.41→8.04 | 31/74 |
| Лаврак (seabass) | Эпические | event-only | 16–41→17–45 | 70.83→89.58 | 20.74→11.08 | 92.92→94.92 | 9.29→7.31 | 31/74 |
| Лихия (leerfish) | Эпические | event-only | 19–47→21–51 | 72.92→89.50 | 20.08→10.74 | 94.00→96.75 | 9.17→7.32 | 30/72 |
| Осётр (sturgeon) | Легендарные | standard | 35–103→38–111 | 43.00→61.75 | 25.27→15.04 | 73.83→81.67 | 12.79→9.75 | 175/420 |
| Голубой тунец (tuna) | Легендарные | standard | 39–108→42–117 | 49.25→66.92 | 20.60→13.92 | 78.67→85.25 | 9.94→8.41 | 170/405 |
| Меч-рыба (swordfish) | Легендарные | standard | 39–108→42–117 | 46.58→65.42 | 22.81→14.92 | 80.83→88.75 | 10.45→8.57 | 175/420 |
| Морской чёрт (angler) | Легендарные | standard | 32–94→34–101 | 44.83→59.00 | 22.74→16.02 | 74.58→80.33 | 11.58→10.14 | 180/430 |
| Синий марлин (bluemarlin) | Легендарные | event-only | new→72–199 | new→67.42 | new→14.67 | new→87.42 | new→8.53 | 175/420 |
| Большая белая акула (whiteshark) | Мифическая | standard | 197–394→212–424 | 12.17→36.25 | 65.25→23.22 | 56.50→68.92 | 15.15→11.86 | 195/465 |
| Гренландская акула (greenlandshark) | Мифическая | event-only | new→350–763 | new→27.67 | new→28.41 | new→57.83 | new→13.35 | 195/465 |

## Final32 isolated modifiers

Fixed-state gross fish income, excludes purchase costs/chests/discovery/quest payments. Rod-only XP0 snapshots isolate effects rather than an ordinary history. Potential quest column assumes complete claimed cycles.

|Snapshot|Zone factor|Bite factor|Rare factor|Sale factor|Clear fish coins/min|Event fish coins/min|Clear XP/min|Potential quest/min|
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| noviceBeer | 1 | 1 | 1.2 | 1.1 | 23.810687 | 32.695076 | 89.064001 | 11.731209 |
| level1 | 1.025 | 1 | 1.025 | 1 | 21.287915 | 29.208198 | 90.225607 | 11.910874 |
| level10 | 1.25 | 1 | 1.25 | 1 | 25.353263 | 34.128573 | 109.775688 | 12.401771 |
| advanced | 1.1 | 1.1 | 1 | 1 | 23.486772 | 32.174300 | 101.979778 | 12.828630 |
| professional | 1.2 | 1.2 | 1 | 1 | 25.883266 | 35.262362 | 114.732119 | 13.744671 |
| master | 1.3 | 1.3 | 1 | 1 | 28.167901 | 38.372399 | 127.893276 | 14.586653 |
| max | 1.625 | 1.3 | 1.25 | 1 | 33.002821 | 44.059553 | 154.112853 | 15.039876 |
| maxBeer | 1.625 | 1.3 | 1.5 | 1.1 | 38.313988 | 50.576484 | 158.094421 | 15.002036 |

## Final verification and freeze

New32 behavior tests first failed on absent species, count30 instead of32, absent unique common/allfive tiers and previous event20.39% gain below the required >30% expectation. All five then passed. The previous per-species difficulty check also caught placeholder calibration and now reproduces both new measured scores exactly to0.1tick. No band expectation was relaxed: all32 still pass strict cost-to-success bands for ordinary/expert models, both600-seed batches including independent holdout. The normal-income tolerance changed only because the explicitly approved event-common availability change was accepted within5% by parent; the unchanged earlier30 exact +49.9968% checkpoint is preserved above.

Final owned command: `/opt/homebrew/bin/node --test test/fishing2.test.ts test/fishprogress.test.ts test/fishmods.test.ts test/fishbalance.test.ts test/fishevent32.test.ts`:32tests passed,0failed,0skipped. Strict TypeScript7 check of10owned source/test files using --ignoreConfig and project-equivalent ES2023/bundler/strict/noUnused/verbatim/erasable/isolated flags: exit0.

Runtime freeze includes shared/fishing.ts, fishrules.ts, fishreel.ts, fishprogress.ts; only docs/numeric evidence were written afterward. Additional owned file is test/fishevent32.test.ts; additional evidence is BALANCE-fishing-rules-32.json. Protocol/API stayed stable and server/UI were notified of indices34/35,32-count and picarel event-only common. Root owns complete gates, actual desktop acceptance and brief mobile smoke. No server/browser/deploy/real-data operations by this worker.
