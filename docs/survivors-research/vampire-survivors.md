# Vampire Survivors (poncle): Design Research

## Sources and reliability

- **Primary (used for most numbers):** Vampire Survivors Wiki mirror at vampire.survivors.wiki (pages: Mad_Forest, Reaper, Treasure_Chest, Whip, Magic_Wand, Knife, Garlic, King_Bible, Axe, Cross, Fire_Wand, Santa_Water, Lightning_Ring, Floor_Chicken, Level_Up, PowerUps, Gift, Characters). Values are as the wiki states them; patch-dependent.
- **Wikipedia:** https://en.wikipedia.org/wiki/Vampire_Survivors (release dates, reception, awards, developer).
- **Steam store page:** https://store.steampowered.com/app/1794680/Vampire_Survivors/ (price, reviews, DLC list).
- **Passive table:** https://rogueranker.com/vampire-survivors-passive-items/
- **Not accessible:** The official fandom wiki (vampire-survivors.fandom.com) returned HTTP 402 for every page, and primagames.com returned 403 on one article. Those are not used as sources.
- **Gaps:** No source fetched covered pause behaviour, the exact wrap/bounded behaviour of the open maps, experience-gem values, or the "juice" design rationale in detail. Those are marked as unverified below.

## 1. Core loop and run structure

- Genre: time-survival roguelite / auto-shooter. The character attacks automatically while the player moves to survive waves of monsters that damage on contact (Wikipedia; Steam store page).
- Drops: defeated enemies drop experience gems (for leveling), floor chicken (health) and other items (Wikipedia).
- Time limits: stages have a limit of 15, 20 or 30 minutes depending on the stage (Wikipedia; Reaper page).
- Mad Forest (the first stage, unlocked from the start) is 30:00 (Mad Forest page).
- Reaching the time limit counts as a success and grants bonus gold (Wikipedia).
- Mad Forest has 4-direction "standard" spawns on an open map with few obstacles. The page does not say whether the map wraps or is bounded (Mad Forest page).
- Wikipedia describes the stage as an "endless stage featuring an auto-generated, repeating layout". This suggests a repeating/tiled layout, but it is not confirmed as wraparound.
- Stage names from the wiki listings include Mad Forest, Dairy Plant, Il Molise, Cappella Magna, Boss Rash, Laborratory, Abyss Foscari, Hectic Highway, Green Acres, Inlaid Library, Tiny Bridge, Mt. Moonspell, Lake Foscari, Neo Galuga, Gallo Tower, Bat Country, The Bone Zone and Infinite Corridor (Gift page listing; the list may include DLC stages).

## 2. The Reaper (Red Death)

- Spawn time depends on the stage (Reaper page):
  - 30:00 for most normal stages, including Mad Forest, Inlaid Library, Dairy Plant, Green Acres, Room 1665 and Cappella Magna (a different variant).
  - 20:00 for Whiteout, Space 54, Laborratory, Bat Country, Astral Stair and Tiny Bridge.
  - 15:00 for Il Molise, Moongolow, Carlo Cart and Hectic Highway.
- The Mad Forest wave table lists the Reaper at 30:00+ as one Reaper with a 60-second interval, and says it clears all enemies (Mad Forest page).
- Per-minute escalation: one additional Reaper spawns every minute after the threshold (Reaper page: "Each minute after 30 an additional Reaper spawns").
- Reaper stats (Reaper page): 655,350 HP, multiplied by the player's level at spawn. Deals 65,535 damage. Has -50% knockback resistance. Can be frozen (for example by Clock Lancet or Orologion).
- Kill method (Reaper page): as of v0.6.1, the most accessible approach is Crimson Shroud plus Infinite Corridor. Crimson Shroud caps incoming damage at 10 per hit and amplifies retaliation. Infinite Corridor halves enemy health. Before v0.6.1, the intended route was a level 200 Toastie with heavy Armor and healing.
- Consequences (Reaper page):
  - Surviving to the end grants 500 gold. Each revive adds stacking bonuses of +100, +200, +300 and +400, then resets to +100. Three revives total 1,100 gold.
  - Killing a Reaper for the first time unlocks Mask of the Red Death as a playable character.
  - Defeating it with Infinite Corridor or Crimson Shroud drops 5 Golden Eggs and makes the White Hand appear, which ends the run permanently.
  - A July 2022 hotfix made defeating the Reaper before 31:00 count as surviving 31 minutes.
- Endless mode (search snippets, unverified in a fetched page): disables Reapers; the wave cycle restarts and enemies get tougher each cycle.

## 3. Enemy spawn scaling (Mad Forest as the reference)

The wiki gives a per-minute table of enemy groups, minimum counts, spawn intervals (seconds), bosses, chest tiers and map events. Selected rows:

| Time | Enemies | Min count | Interval (s) | Boss | Notes |
|---|---|---|---|---|---|
| 0:00 | Red-Eyed Pipeestrello | 15 | 1.0 | - | Opening wave |
| 1:00 | Zombie, Little Pipeestrello | 30 | 1.0 | Glowing Bat | Lv1 chest |
| 2:00 | Little Pipeestrello, Red-Eyed Pipeestrello 1 and 2 | 50 | 0.5 | - | Bat Swarm 100%, x3 |
| 3:00 | Skeleton | 40 | 0.25 | Glowing Bat | Lv1 chest |
| 7:00 | Red-Eyed Pipeestrello, Gray Mudman | 80 | 0.5 | Glowing Bat | Lv2 chest; Bat Swarm 80%, x6 |
| 8:00 | Zombie | 100 | 1.5 | Giant Bat | Bat Swarm 80%, x3 |
| 10:00 | Gray and Green Mudman | 10 | 0.5 | Giant Mantichana | Evo chest; Flower Wall 100% |
| 11:00 | Skeleton-3 | 300 | 0.1 | Glowing Bat | Arcana chest |
| 13:00 | Werewolf, Ghost (x2) | 150 | 0.5 | - | Ghost Swarm 70%, x21 |
| 17:00 | Big Mummy | 20 | 1.0 | - | - |
| 20:00 | Big Mummy, Green Mudman, Giant Bat | 100 | 0.1 | Giant Mummy | Bat Swarm 70%, x21 |
| 21:00 | Flower Wall, Venus | 300 | 0.1 | Glowing Bat | Arcana chest |
| 25:00 | Venus | 100 | 0.1 | Giant Blue Venus | Evo chest; Flower Wall 100%, x6 |
| 27:00 | Big Mummy, Gray and Green Mudman | 300 | 0.1 | Glowing Bat | Ghost Swarm 100%, x20 |
| 29:00 | Glowing Bat, Silver Bat | 300 | 0.1 | Glowing Bat | Bat Swarm 100%, x20 |
| 30:00+ | The Reaper | 1 | 60 | - | Clears all enemies |

Observed structure:
- Spawn intervals drop from 1.0 s early to 0.1 s by about 10 to 11 minutes, and stay at 0.1 s for much of the back half. Minimum counts climb from 15 to 300 per wave group.
- Bosses appear roughly every 1 to 2 minutes, with named mini-bosses (Glowing Bat, Silver Bat, Giant Bat, Mantichana, Venus) and a Giant boss at 25:00.
- "Swarm" events (Bat Swarm, Ghost Swarm, Flower Wall) are scripted map events with percentage chance and multiplier counts.
- The page lists no separate elite category. Bosses are the marked enemies.
- Hyper mode is unlocked by defeating Giant Blue Venus at 25:00 in normal mode.

## 4. Treasure chests

- Chests drop mainly from bosses, not from light sources. They do not get pulled toward the player (Treasure Chest page).
- Chest tiers (Treasure Chest page):
  - **Bronze:** usually cannot evolve. Typically from bosses before 10:00.
  - **Silver:** can evolve or unite weapons. Typically from bosses after 10:00.
  - **Gold:** can grant weapons the player does not own. Items appear as map pickups. As of December 2025, evolutions and locked weapons are excluded.
  - **Arcana (purple):** offers a choice of Arcanas, typically from the 11:00 and 21:00 bosses in Mad Forest.
  - **Dark:** 50% act like a single-item Bronze chest; 50% grant a new passive.
- Item count: most chests give 1 item. Luck raises the chance of 3 or 5 items. Luck affects chest quality only. Boss treasure configs roll separately (for example a Silver Bat at 9:00 rolls 3% for 5 items, 10% for 3 items and 50% for 1 item; the rest fall back to a level 1 chest).
- Gold per chest: about 100 to 200 for 1 item, 300 to 600 for 3 items, 500 to 1,000 for 5 items. Greed multiplies it.
- Evolution: generally one weapon evolves per chest. If nothing can be upgraded, items are replaced with Big Coin Bags (25 gold each), normally about 150 gold total.
- The first six chests in a save follow the item sequence 1-1-3-1-1-5 (Treasure Chest page).

## 5. XP gems and level-up choices

- Level-up requirements (Level Up page):
  - Level 1 to 2: 5 XP. Each later level needs 10 more than the previous one (2 to 3 = 15, 3 to 4 = 25) through level 20.
  - Levels 21 to 40: +13 XP per level. Level 41 onward: +16 XP per level.
  - Level 20 and 40 add extra thresholds of +600 and +2,400 XP.
  - Total XP: 1,805 at level 20; 9,886.5 at level 40; 27,848 at level 60.
  - Growth: the player gets +100% growth until reaching the next level (page wording).
- Choices per level-up: 3 options, sometimes 4. The fourth depends on Luck. Choices come from weapons and passives. The same item cannot be offered twice in one level-up.
- Slot cap: 6 weapons plus passives combined. Once full and nothing can upgrade, level-ups offer Gold or Floor Chicken (Level Up page; Wikipedia says "three or four options" and that after six weapons and six passives are maxed, only gold or chicken appear).
- Reroll, Skip and Banish: granted by PowerUps (see section 9). Base PowerUp ranks are +2 per rank, max rank 5 for each (PowerUps page). Banish removes an item from the pool for the rest of the run. Sources disagree on exact starting counts without a PowerUp; the search snippets mention Arcana XX (Silent Old Sanctuary) giving +3 Reroll/Skip/Banish and +1 weapon slot for unique characters. The unlock condition for that Arcana differs across sources.
- Gem values: not found in any fetched source.

## 6. Weapons (base game, with verified stats)

All weapons are capped at level 8. Values are base level 1 unless noted.

- **Whip** (Whip page): 10 dmg, 1.35 s cooldown, 100% area. L2: +1 projectile. L3/5/7/8: +5 dmg; L4/6: +10% area and +5 dmg. Max: 40 dmg, 120% area, amount 2. Evolves into Bloody Tear with Hollow Heart.
- **Magic Wand** (Magic Wand page): 10 dmg, 1.2 s cooldown, 1 projectile, pierce 1. L2/4/6: +1 projectile. L3: -0.2 s cooldown. L5/8: +10 dmg. L7: +1 pierce. Max: 30 dmg, 4 projectiles, pierce 2, 1.0 s cooldown. Evolves into Holy Wand with Empty Tome.
- **Knife** (Knife page): 6.5 dmg, 1.0 s cooldown, 1 amount, 1 pierce. Fires in the facing direction. L2/3/4/6/7: +1 amount; L3/7: +5 dmg; L5/8: pierce +1 (L8 is +1 pierce as well); L4/6/8: -0.02 s interval. Max: 16.5 dmg, 6 amount, 3 pierce. Evolves into Thousand Edge with Bracer.
- **Axe** (Axe page): 20 dmg, 4.0 s cooldown, 1 projectile. L2/5: +1 projectile. L3/6/8: +20 dmg. L4/7: pierce +2. Max: 80 dmg, 3 amount, 7 pierce. Evolves into Death Spiral with Candelabrador.
- **Cross** (Cross page): 5 dmg, 2.0 s cooldown, 1 amount. L2/5/8: +10 dmg (L8 is +10). L3/6: +10% area, +25% speed. L4/7: +1 projectile. Evolves into Heaven Sword with Clover.
- **Fire Wand** (Fire Wand page): 20 dmg, 3.0 s cooldown, amount 3. Targets a random enemy. Every level adds +10 dmg; L3/5/7: +20% speed. Max: 90 dmg, 135% speed. Cooldown and amount do not scale. Evolves into Hellfire with Spinach.
- **Garlic** (Garlic page): 5 dmg, 1.3 s cooldown, 100% area, 0 knockback, pool limit 50. Each enemy is hit once per cooldown period, even if it leaves and re-enters the aura. L3/5/7: -0.1 s cooldown. Max: 15 dmg, 200% area, 1.0 s cooldown. Evolves into Soul Eater with Pummarola.
- **King Bible** (King Bible page): 10 dmg, 3.0 s cooldown, amount 1, duration 3.0 s. The cooldown is extended by duration, so the cycle is about 6 s. Orbits the character. Evolves into Unholy Vespers with Spellbinder.
- **Santa Water** (Santa Water page): 10 dmg, 100% area, 4.5 s cooldown, 2.0 s duration. Max: 40 dmg, 180% area, 3.0 s duration, +1 projectile at L2/4/6. Cooldown never changes. The page lists L5 and L7 duration gains as 0.3 s; a footnote gives 0.25 s and the table uses 0.25.
- **Lightning Ring** (Lightning Ring page): 15 dmg, 4.5 s cooldown, amount 2, 100% area. Per level: +1 projectile at L2/4/6/8. Area +100% at L3/5/7; damage +10/+20/+20. Max: 65 dmg, 400% area, 6 amount. Cooldown never changes. Evolves into Thunder Loop with Duplicator.
- **Weapons from search snippets (not verified on a stat page):** Runetracer, Pentagram (evolves into Gorgeous Moon with Crown per the passive table), Heaven Sword, Holy Wand, Thousand Edge, Death Spiral, Hellfire, Soul Eater, Bloody Tear, Unholy Vespers, Thunder Loop, Gorgeous Moon, Infinite Corridor, Crimson Shroud.
- Weapon list by DLC (Gift/weapon listing): base game includes Pentagram, Glass Fandango, Gaze of Gaea, Arma Dio, Bracelet, Victory Sword, Santa Javelin, Clock Lancet, Vento Sacro, Song of Mana, Ebony Wings, Phas3r, Pako Battiliar, Magi-Stone, Infinite Corridor, Crimson Shroud, Gorgeous Moon. Expansions add more: Legacy of the Moonspell (13 weapons per Wikipedia), Operation Guns (22), Ode to Castlevania (100+ per Wikipedia). The Gift page's counts conflict with its own list lengths, so exact totals are not reliable.

## 7. Passive items

Passives only boost stats. Most cap at level 5 (implied). Per-level bonuses (rogueranker passive table):

| Passive | Per-level bonus (max) | Catalyst (evolution) |
|---|---|---|
| Spinach | +10% Might (+50%) | Fire Wand -> Hellfire |
| Armor | -1 damage taken (-5) | (union with Infinite Corridor per rogueranker) |
| Hollow Heart | +20% Max HP (+100%) | Whip -> Bloody Tear |
| Pummarola | +0.2 HP/s recovery (+1/s) | Garlic -> Soul Eater |
| Empty Tome | -8% cooldown (-40%) | Magic Wand -> Holy Wand |
| Candelabrador | +10% area (+50%) | Axe -> Death Spiral |
| Bracer | +10% projectile speed (+50%) | Knife -> Thousand Edge |
| Spellbinder | +10% duration (+50%) | King Bible -> Unholy Vespers |
| Duplicator | +1 amount (max +2, max level 2) | Lightning Ring -> Thunder Loop |
| Wings | +10% movement speed (+50%) | Not clear in source |
| Attractorb | +25% magnet range | None; pairs with Crown for faster level-ups |
| Clover | +10% luck (+50%) | Cross -> Heaven Sword (per wiki Cross page); rogueranker lists a different pairing |
| Crown | +8% growth (+40%) | Pentagram -> Gorgeous Moon |
| Stone Mask | +10% greed (+50%) | Gatti Amari -> Vicious Hunger |
| Skull O'Maniac | +10% curse (+50%) | Song of Mana -> Mannajja |
| Tirajisu | +1 revival (max 2, consumed on use) | None |
| Torrona's Box | +25% omni at lv8, +100% curse at lv9 | Victory Sword -> Sole Solution (gift) |

- 34 passives total: 17 base game, 4 Yellow Sign (Silver Ring, Gold Ring, Metaglio Left, Metaglio Right), 13 DLC.
- Evolutions need the base weapon at max level, the catalyst passive held when the evolution chest opens, and the passive is consumed (rogueranker; wiki Treasure Chest page).
- Note: rogueranker lists Armor as an Infinite Corridor catalyst and the Yellow Sign rings as halves of that union; these conflict and are flagged for verification.
- Bloody Tear's effect is described differently across sources (heal per damage, lifesteal, or missing-health crit). Verify on the wiki's Bloody Tear page before quoting.

## 8. Evolutions, unions and gifts

- Evolution: fully leveled weapon + catalyst passive -> evolved weapon. The evolved weapon typically starts at level 1 and has its own stat line.
- Unions merge two weapons into one, freeing a slot (Infinite Corridor uses Silver Ring + Gold Ring halves; Crimson Shroud uses Metaglio Left + Metaglio Right halves).
- Gifts: an extra weapon or passive granted when conditions are met. The base weapon stays in inventory. Examples: Victory Sword (max Torrona's Box + Treasure Chest 2) gives Sole Solution; Candybox (max passives and evolutions + Treasure Chest 2) gives Super Candybox II Turbo (Gift page).
- Evolution chests are usually bosses after 10:00 (Silver chests).
- Characters with morphing starting weapons: Mortaccio, Yatta Cavallo, O'Sole Meeo (search snippet).

## 9. Meta progression

- Gold: coins collected in runs (Steam store page). Reaching the time limit grants bonus gold; Reaper revives give stacking bonuses (see section 2).
- PowerUps (27 total, bought with gold from the title menu; PowerUps page):
  - Might 5 ranks +5%, 200g. Armor 3 ranks +1, 600g. Max Health 3 ranks +10%, 200g. Recovery 5 ranks +0.1, 200g.
  - Cooldown 2 ranks -2.5%, 900g. Area 2 ranks +5%, 300g. Speed 2 ranks +10%, 300g. Duration 2 ranks +15%, 300g.
  - Amount 1 rank +1, 5,000g. Move Speed 2 ranks +5%, 600g. Magnet 2 ranks +25%, 300g. Luck 3 ranks +10%, 600g.
  - Growth 5 ranks +3%, 900g. Greed 5 ranks +10%, 200g. Curse 5 ranks +10%, 1,666g. Revival 1 rank +1, 10,000g.
  - Omni 5 ranks +2%, 1,000g. Charm 5 ranks +20, 10,000g. Defang 5 ranks +3%, 10g.
  - Reroll 5 ranks +2, 1,000g. Skip 5 ranks +2, 100g. Banish 5 ranks +2, 100g. Preserve 5 ranks +10%, 500g.
  - Seal I-III (10 ranks each), Seal All (10 ranks): 10,000g initial.
- Price rises per rank. Costs listed are initial prices.
- Banish unlocks through the Collection (first rank at 50 items, +10 per rank, up to 5 at 90 items; search snippet).
- Preserve (added October 2025): 10% chance per rank to save a used Reroll/Skip/Banish, up to 50% (search snippet; wiki).
- Characters (Characters page): 34 standard base-game characters and 22 secret base-game characters.
  - Antonio Belpaese is the only character available on a new save.
  - Queen Sigma costs 0 gold but requires an achievement.
  - Other standard characters cost gold, and the price rises 10% additive per purchase.
  - Starting weapons are shown only as sprites on the wiki; they are not text-verified here.
- Challenges unlock stages, weapons, characters and modifiers. Modifiers include endless mode, hyper mode (faster player and enemies) and limit break (Wikipedia-style summary).
- Golden Eggs (from Reaper kills or some enemies) permanently boost the selected character (Wikipedia).

## 10. Map design, light sources and floor pickups

- Mad Forest is an open map with few obstacles. Destructibles are light sources (braziers) only. Breaking one drops a random pickup. Base chance 10% (up to 50% with Luck), up to 10 on screen, 10 at start (Mad Forest page).
- Floor Chicken (Floor Chicken page): restores 30 HP (ID ROAST). Drops from light sources with a Luck-dependent rate. Can be offered at level-up late game when the inventory is full and maxed. Doubled by Sarabande of Healing (to 60). Collecting 5 unlocks Garlic; collecting 500 unlocks The Coop stage.
- Rosary, Orologion and Vacuum are listed on the wiki pickup nav but no effects were fetched. Orologion freezes enemies (Reaper page mention). Nduja Fritta Tanto also listed, no details fetched.
- Golden chests come from Zi'Appunta Belpaese's light sources (Luck-based); dark chests from Levarsee Darkasso (Treasure Chest page).
- Wraparound vs bounded: not confirmed by any fetched source. Wikipedia's "repeating layout" suggests a tiled/looping arena, but this should be checked in-game or on a source that states it explicitly.

## 11. Pause

- No fetched source covered pause behaviour. The wiki page for Pause returned 404. Treat as unverified. Standard expectation for this genre is that the run timer stops on pause, but do not cite that as a source-backed fact.

## 12. What makes it feel good (juice and pacing)

Source-backed points:
- Chest opening uses slot-machine-style flashy visuals, drawing on the developer's gambling-industry background (Wikipedia).
- Reception: Metacritic PC 86, Xbox 95, iOS 91, Switch 88, PS5 89. Game Informer 9.75/10, Eurogamer "Recommended", PC Gamer 87/100. Steam: 98% of 128,229 English reviews positive (Steam store page; Wikipedia).
- Awards: BAFTA Best Game and Game Design; Golden Joystick Breakthrough Award; D.I.C.E. Action Game of the Year (Wikipedia).
- Concurrent Steam players grew from over 30,000 (January 2022) to over 70,000 the following month (Wikipedia).

Design observations supported by the numbers above (analysis, not a single source):
- Escalation is numeric and staged: spawn interval drops from 1.0 s to 0.1 s, minimum counts rise from 15 to 300, bosses every 1 to 2 minutes, and chests scale from Bronze to Silver to Arcana. The per-minute table makes pacing predictable and readable.
- Build depth comes from a small number of hard constraints: 6 weapon slots and 6 passive slots, max level 8 weapons, passives capped near level 5, and evolutions requiring both a maxed weapon and a specific passive. These constraints make each level-up choice a real decision.
- Reward density is high: chests, gold scaling with Greed, and Big Coin Bag fallback keep rewards flowing even after the build is full.
- The Reaper creates a climactic end: a hard fail state with a challenge (freeze, shroud, halve HP) and a per-minute escalation.
- Meta gold and PowerUps convert run success into permanent growth without changing run-level balance, which encourages repeated runs.

## Open questions for verification

1. Wraparound vs bounded maps and whether braziers are the only destructible source (only Mad Forest verified).
2. Pause behaviour (timer, spawns).
3. Experience gem values per level.
4. Exact Reroll/Skip/Banish starting counts before PowerUps.
5. Evolution catalyst conflicts (Armor/Infinite Corridor, Clover/Cross, Wings/Gorgeous Moon).
6. Bloody Tear effect.
7. Full base-game stats for Runetracer, Pentagram, Heaven Sword, Holy Wand, Thousand Edge, Death Spiral, Hellfire, Soul Eater, Bloody Tear, Unholy Vespers, Thunder Loop, Gorgeous Moon, Infinite Corridor and Crimson Shroud (not fetched; the wiki pages were not checked).
