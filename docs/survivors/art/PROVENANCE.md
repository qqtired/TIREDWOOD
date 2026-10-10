# Концепт-арт режима «Подземелье» — происхождение

Все картинки нарисованы 10 октября 2026 через **Codex CLI, встроенный инструмент `image_gen`**
(`codex exec -s workspace-write -C <папка> -o <лог> -`, промпт на stdin; по одной картинке на вызов, ключи не трогали).
Готовые файлы скопированы из `~/.codex/generated_images/…`. Кодом ничего не рисовали, правок руками нет.
Оригиналы — `<номер>-<имя>.png`, для веба — `web/<номер>-<имя>.jpg` (длинная сторона не больше 1600 px: 1672 px у key-art уменьшено до 1600, остальные 1536 px оставлены как есть, без растяжки; `sips`, качество 82).
Надписей на картинках нет (проверено глазами). Подробные замечания к каждой — в отчёте ведущему.

Каждый промпт собран из четырёх частей: **вступление** (просим `image_gen`, одну картинку), **описание сцены** (своё для каждой),
**общий стиль** (одинаковый у всех) и **требование без надписей**. Каждый промпт ниже приведён целиком.

| Файл | Исходник Codex | Дата | Источник |
|---|---|---|---|
| `1-key-art.png` | `01a12663-0fd7-7462-bae0-f6bc9d424a3d/exec-f901310b-…png` (1672×941) | 2026-10-10 | Codex CLI image_gen |
| `2-hero.png` | `01a12663-5e8f-7092-89b4-a383f7361291/exec-bf71b316-…png` (1536×1024) | 2026-10-10 | Codex CLI image_gen |
| `3-mobs.png` | `01a12669-f5b6-7f81-8dc4-327e65ffba50/exec-ae28d0c2-…png` (1536×1024), третья попытка | 2026-10-10 | Codex CLI image_gen |
| `4-elites-boss.png` | `01a12665-4970-7972-bac3-77e30c01dd25/exec-c5a893db-…png` (1536×1024) | 2026-10-10 | Codex CLI image_gen |
| `5-biomes.png` | `01a12665-e7c6-7423-a49c-300f4279d6fb/exec-67f9042d-…png` (1536×1024) | 2026-10-10 | Codex CLI image_gen |
| `6-interactables.png` | `01a12666-d18b-7330-9d21-4185588735f9/exec-080ff293-…png` (1536×1024) | 2026-10-10 | Codex CLI image_gen |
| `7-entrance.png` | `01a12667-285f-7ac0-b59c-2ff6cb575ee2/exec-724a3737-…png` (1536×1024) | 2026-10-10 | Codex CLI image_gen |
| `alt/3-mobs-v1-scale-off.png` | `01a12664-77cf-7340-a0fa-94acc43d6004/exec-a91f2b83-…png` | 2026-10-10 | Codex CLI image_gen, первая попытка: фон чистый, но крыса и летучая мышь нарисованы почти в размер остальных (масштаб не выдержан) |
| `alt/3-mobs-v2-bad-background.png` | `01a12668-ad02-7222-8b52-a8f377a608f8/exec-7696f9d3-…png` | 2026-10-10 | Codex CLI image_gen, вторая попытка: масштаб верный, но фон превратился в бело-коричневую пятнистую «пиксельную» кашу, не годится |

Промпты по картинкам — ниже, целиком (текст ровно такой, какой пошёл на stdin Codex).

## 1-key-art.png

```
Use your built-in image generation tool (image_gen) to generate exactly ONE image from the brief below. Do not draw it with code, scripts or SVG, do not edit other files. After generating, tell me the exact file path of the generated image. Brief:

Wide cinematic landscape 16:9 gameplay key art for a top-down survivor action game (Vampire-Survivors-like, but rendered in 3D): a cave dungeon floor seen from above at a camera angle of about 55 degrees, like a tilted-down action-game camera. In the center stands the hero, the Lamplighter: a stocky, sturdy, slightly cartoonish human cellar keeper (NOT a jelly bean) in a miner's helmet with a small lamp, a brown leather apron, big boots, holding a huge brass lantern on a long chain and swinging it. The lantern throws a big warm amber circle of light on the cave floor around him. Around the light circle, a dense horde of purple creatures closes in from the shadows: cellar rats, bats, slime blobs, little walking mushroom men, shield beetles, all smeared with violet jam splotches and drips and with glowing lilac eyes. Some are being hit: bright warm slash arcs, flashes of golden-amber light sparks and small impact bursts, a few enemies bursting into jam splashes. Around the arena: iron braziers with warm fire, clusters of turquoise crystals, rock walls with glowing violet jam veins, old barrels and wooden crates. Dynamic, energetic, readable composition, hero clearly the brightest focal point, strong depth, warm-vs-cool contrast.

Style: polished hand-painted cartoon concept art for a browser action game: warm storybook painting with clean readable shapes, soft rounded forms, soft brushwork, gentle painterly texture, dense rich saturated colors. It is the same warm painted look as a cozy sunny seaside-town game, but the underground, night-time, slightly darker version. Mood: light dark fantasy without excess, atmospheric, mysterious and a little eerie, still charming. Palette: dark WARM stone (brown-plum, never pure black), warm amber glow of torches, lanterns and braziers, cool turquoise crystals as an accent, glowing violet/lilac fruit jam (thick glossy blackcurrant-grape jam) veins, blobs and drips. Strictly: no blood, no gore, no guts, no skulls or bone piles, no horror, not childish, not sci-fi, no neon, no pure black shadows, no blue-and-yellow flags or pennants. The ground is lighter than the walls, and the creatures contrast clearly with the floor.

Strictly: no text, no letters, no numbers, no runes that look like letters, no logos, no UI, no HUD, no health bars, no frame, no border, no watermark, no signature.
no text, no letters, no logos, no UI.
```

## 2-hero.png

```
Use your built-in image generation tool (image_gen) to generate exactly ONE image from the brief below. Do not draw it with code, scripts or SVG, do not edit other files. After generating, tell me the exact file path of the generated image. Brief:

Character concept design sheet on a plain neutral warm light-grey background (no scene), landscape 3:2. Four views of the SAME character in one row, same scale and consistent design, full body each: 1) front view, 2) side profile view, 3) back view, 4) top-down view as seen from about 55 degrees above (the in-game camera angle, showing how the silhouette reads from above). Character: the Lamplighter, the keeper of old cellars, a stocky, sturdy, slightly cartoonish human (NOT a jelly bean, NOT a robot), chunky proportions with a slightly big head, a dented miner's helmet with a small brass lamp on the front, a short beard or mustache, warm brown leather apron over a patched wool shirt, rolled sleeves, thick work gloves, heavy boots, a belt with tools, and a large brass-and-glass lantern with a warm glowing flame hanging on a long chain from his hand (the lantern is his signature item and main weapon). Warm colors: leather brown, mustard-free muted olive and cream, brass, glowing amber lantern. Friendly but determined face. Clean studio-lit concept art, soft shadow under each figure, simple and readable silhouette. Use only a neutral background, no scenery.

Style: polished hand-painted cartoon concept art for a browser action game: warm storybook painting with clean readable shapes, soft rounded forms, soft brushwork, gentle painterly texture, dense rich saturated colors. It is the same warm painted look as a cozy sunny seaside-town game, but the underground, night-time, slightly darker version. Mood: light dark fantasy without excess, atmospheric, mysterious and a little eerie, still charming. Palette: dark WARM stone (brown-plum, never pure black), warm amber glow of torches, lanterns and braziers, cool turquoise crystals as an accent, glowing violet/lilac fruit jam (thick glossy blackcurrant-grape jam) veins, blobs and drips. Strictly: no blood, no gore, no guts, no skulls or bone piles, no horror, not childish, not sci-fi, no neon, no pure black shadows, no blue-and-yellow flags or pennants. The ground is lighter than the walls, and the creatures contrast clearly with the floor.

Strictly: no text, no letters, no numbers, no runes that look like letters, no logos, no UI, no HUD, no health bars, no frame, no border, no watermark, no signature.
no text, no letters, no logos, no UI.
```

## 3-mobs.png

```
Use your built-in image generation tool (image_gen) to generate exactly ONE image from the brief below. Do not draw it with code, scripts or SVG, do not edit other files. After generating, tell me the exact file path of the generated image. Brief:

Enemy lineup concept sheet on a perfectly smooth, flat, uniform dark warm taupe-brown background filling the whole canvas edge to edge (a clean solid studio backdrop: no white areas, no smoke, no fog, no clouds, no blotches, no pixelation, no gradient patches, no scene), landscape 3:2, arranged in two rows of three with ONE common ground line per row, and ONE consistent true-to-life relative scale across all six so that sizes can be compared directly. Six rank-and-file cave enemies of the Jam Baron's underground army, drawn in the same soft painted cartoon style with rounded friendly-menacing forms, each fully visible with a soft shadow beneath. CRITICAL SCALE RULE (draw them at these relative sizes): the mushroom man is the tallest, about 100 cm tall; the shield beetle about 80 cm long and 60 cm tall; the spitter toad about 60 cm tall; the jam slug about 60 cm long and low; the cellar rat is SMALL, only about 35 cm long, clearly less than half the height of the mushroom man; the bat's body is tiny (about 20 cm body, spread wings about 60 cm wide) and it hovers a little above the ground. Top row: 1) the cellar rat (small, fast, long tail), 2) the cave bat with spread wings, 3) the jam slug (slow plump glossy slug-blob made of purple jam). Bottom row: 4) the mushroom man (a stout walking mushroom with a fat cap and stubby legs), 5) the shield beetle (chunky beetle with a thick armored plated shell, a shield-like plate in front), 6) the spitter (a plump toad-like creature with swollen jam-filled cheeks). Common mark of the whole army: every creature is smeared with violet jam splotches and drips and has glowing lilac eyes. Cute-menacing, not scary, not gory. Soft rounded storybook painting, not photorealistic.

Style: polished hand-painted cartoon concept art for a browser action game: warm storybook painting with clean readable shapes, soft rounded forms, soft brushwork, gentle painterly texture, dense rich saturated colors. It is the same warm painted look as a cozy sunny seaside-town game, but the underground, night-time, slightly darker version. Mood: light dark fantasy without excess, atmospheric, mysterious and a little eerie, still charming. Palette: dark WARM stone (brown-plum, never pure black), warm amber glow of torches, lanterns and braziers, cool turquoise crystals as an accent, glowing violet/lilac fruit jam (thick glossy blackcurrant-grape jam) veins, blobs and drips. Strictly: no blood, no gore, no guts, no skulls or bone piles, no horror, not childish, not sci-fi, no neon, no pure black shadows, no blue-and-yellow flags or pennants. The ground is lighter than the walls, and the creatures contrast clearly with the floor.

Strictly: no text, no letters, no numbers, no runes that look like letters, no logos, no UI, no HUD, no health bars, no frame, no border, no watermark, no signature.
no text, no letters, no logos, no UI.
```

## 4-elites-boss.png

```
Use your built-in image generation tool (image_gen) to generate exactly ONE image from the brief below. Do not draw it with code, scripts or SVG, do not edit other files. After generating, tell me the exact file path of the generated image. Brief:

Concept art, landscape 3:2, in a cave chamber with a warm lit stone floor, showing scale comparison of three bosses side by side. In the foreground left: the Cooper (Bochar), an elite brute troll about 2.5 meters tall with a thick belly, mossy grey-green skin, wearing a big wooden barrel like armor on his shoulders and back with iron hoops, charging posture with a wooden mallet. In the foreground right: the Mushroom Shaman, an elite, a tall thin walking mushroom elder with a wide speckled purple cap, a gnarled staff with a glowing lilac jam-crystal and small floating spore lights, healing aura. Behind and towering over both: the Old Jam (Staroe Povidlo), the huge boss: an enormous cave worm many times taller than the two elites, rising from a hole in the ground, with a heavy armored stone-plated head with tough rocky armor and a round maw with blunt teeth, and a long segmented body whose segments are glowing with luminous violet jam under the plates, jam dripping. All three are marked with violet jam splotches and glowing lilac eyes. Torches and turquoise crystals in the background, atmospheric warm amber light. Clear scale: the elites are small next to the giant worm. Not gory, no blood, no skulls, boss is imposing but stylized and charming, soft rounded painted forms.

Style: polished hand-painted cartoon concept art for a browser action game: warm storybook painting with clean readable shapes, soft rounded forms, soft brushwork, gentle painterly texture, dense rich saturated colors. It is the same warm painted look as a cozy sunny seaside-town game, but the underground, night-time, slightly darker version. Mood: light dark fantasy without excess, atmospheric, mysterious and a little eerie, still charming. Palette: dark WARM stone (brown-plum, never pure black), warm amber glow of torches, lanterns and braziers, cool turquoise crystals as an accent, glowing violet/lilac fruit jam (thick glossy blackcurrant-grape jam) veins, blobs and drips. Strictly: no blood, no gore, no guts, no skulls or bone piles, no horror, not childish, not sci-fi, no neon, no pure black shadows, no blue-and-yellow flags or pennants. The ground is lighter than the walls, and the creatures contrast clearly with the floor.

Strictly: no text, no letters, no numbers, no runes that look like letters, no logos, no UI, no HUD, no health bars, no frame, no border, no watermark, no signature.
no text, no letters, no logos, no UI.
```

## 5-biomes.png

```
Use your built-in image generation tool (image_gen) to generate exactly ONE image from the brief below. Do not draw it with code, scripts or SVG, do not edit other files. After generating, tell me the exact file path of the generated image. Brief:

Environment concept sheet, landscape 3:2, four separate cave-floor fragments arranged as a 2x2 grid on a plain dark warm taupe background with clear gaps between them (no frame lines, no text). Each fragment is a rounded-corner patch of a top-down game map seen from about 55 degrees above, with the floor clearly lighter than the walls: 1) CELLARS: old stone wine cellar with wooden barrels, crates, brick arches, hanging lanterns, a stone floor with some jam puddles. 2) MUSHROOM CAVE: damp earthy cave overgrown with huge glowing mushrooms of cream, orange and lilac colors, soft spores floating, mossy ground. 3) CRYSTAL GROTTO: cave with clusters of big turquoise crystals, reflective floor and a small pool, cool bluish-turquoise light mixed with warm amber torch light. 4) JAM VEINS: rock cave where thick glowing violet jam veins run through the stone walls and floor, drips and sticky puddles of jam, a few jam-filled stone vats, lilac glow with warm amber braziers. Each biome has its own dominant color but the same painted style, same lighting logic and scale, so they can be placed next to each other in one game.

Style: polished hand-painted cartoon concept art for a browser action game: warm storybook painting with clean readable shapes, soft rounded forms, soft brushwork, gentle painterly texture, dense rich saturated colors. It is the same warm painted look as a cozy sunny seaside-town game, but the underground, night-time, slightly darker version. Mood: light dark fantasy without excess, atmospheric, mysterious and a little eerie, still charming. Palette: dark WARM stone (brown-plum, never pure black), warm amber glow of torches, lanterns and braziers, cool turquoise crystals as an accent, glowing violet/lilac fruit jam (thick glossy blackcurrant-grape jam) veins, blobs and drips. Strictly: no blood, no gore, no guts, no skulls or bone piles, no horror, not childish, not sci-fi, no neon, no pure black shadows, no blue-and-yellow flags or pennants. The ground is lighter than the walls, and the creatures contrast clearly with the floor.

Strictly: no text, no letters, no numbers, no runes that look like letters, no logos, no UI, no HUD, no health bars, no frame, no border, no watermark, no signature.
no text, no letters, no logos, no UI.
```

## 6-interactables.png

```
Use your built-in image generation tool (image_gen) to generate exactly ONE image from the brief below. Do not draw it with code, scripts or SVG, do not edit other files. After generating, tell me the exact file path of the generated image. Brief:

Props concept sheet, landscape 3:2, four interactive buildings of a cave dungeon arranged in a 2x2 grid on a plain dark warm taupe background with clear gaps (no frame lines, no text), each seen in 3/4 view from above at about 55 degrees, standing on a small round patch of stone floor, same scale and painted style: 1) a stone ALTAR: a low carved stone slab altar with two flickering amber candles and a softly glowing amber-gold carved pattern (abstract ornament only, no letters), offering a temporary blessing. 2) a BRAZIER: a sturdy iron bowl on a tripod, full of burning warm orange fire, with a few gold coins and small treasures glinting in the embers and a pile of loot beside it. 3) a CURSED CHEST: an old wooden chest with iron bands and heavy chains and a lock, its lid slightly open leaking glowing violet jam light and drips, eerie but charming, not horror, no skulls. 4) a HEALING SPRING: a mossy stone basin with a small fountain of clear water glowing soft turquoise-green and mint, small flowers and glowing moss around, gentle healing glow. Cute, chunky, readable shapes, they must read clearly from the game camera.

Style: polished hand-painted cartoon concept art for a browser action game: warm storybook painting with clean readable shapes, soft rounded forms, soft brushwork, gentle painterly texture, dense rich saturated colors. It is the same warm painted look as a cozy sunny seaside-town game, but the underground, night-time, slightly darker version. Mood: light dark fantasy without excess, atmospheric, mysterious and a little eerie, still charming. Palette: dark WARM stone (brown-plum, never pure black), warm amber glow of torches, lanterns and braziers, cool turquoise crystals as an accent, glowing violet/lilac fruit jam (thick glossy blackcurrant-grape jam) veins, blobs and drips. Strictly: no blood, no gore, no guts, no skulls or bone piles, no horror, not childish, not sci-fi, no neon, no pure black shadows, no blue-and-yellow flags or pennants. The ground is lighter than the walls, and the creatures contrast clearly with the floor.

Strictly: no text, no letters, no numbers, no runes that look like letters, no logos, no UI, no HUD, no health bars, no frame, no border, no watermark, no signature.
no text, no letters, no logos, no UI.
```

## 7-entrance.png

```
Use your built-in image generation tool (image_gen) to generate exactly ONE image from the brief below. Do not draw it with code, scripts or SVG, do not edit other files. After generating, tell me the exact file path of the generated image. Brief:

Wide landscape 3:2 illustration in the bright sunny storybook style of a cozy seaside resort town square on the Black Sea coast: bright cheerful midday sunlight, clear blue sky with fluffy white clouds, pastel houses, terracotta roofs, cypress trees, a cobblestone promenade, warm saturated natural colors (this part must look like the light cheerful sunny town, NOT dark). In the middle of the frame, at the base of a rocky cliff on the edge of the square, there is the entrance to the underground dungeon: an old rough stone arch built into the rock with heavy old wooden cellar doors standing half open, with two iron lanterns with warm amber flames hanging on both sides, a little moss and ivy on the stone. Inside the dark archway you can see a warm amber glow and just a hint of glowing violet jam light in the depths, the sunlit square contrasting with the mysterious dark entrance. A few barrels near the doors, a faint purple jam smear on the threshold. Right next to the entrance stands a wooden leaderboard: a big EMPTY wooden board on two posts with a small roof, with no writing at all, blank surface and empty hooks only. Two or three cute glossy jelly-bean people (rounded gummy-candy bodies, two small dark oval eyes, tiny mouths, no legs) stand nearby looking at the entrance, in raspberry red and mint green. No flags or pennants. Keep the bottom-left and bottom-right corners calm and low-detail.

Style: polished hand-painted cartoon concept art for a browser action game: warm storybook painting with clean readable shapes, soft rounded forms, soft brushwork, gentle painterly texture, dense rich saturated colors. It is the same warm painted look as a cozy sunny seaside-town game, but the underground, night-time, slightly darker version. Mood: light dark fantasy without excess, atmospheric, mysterious and a little eerie, still charming. Palette: dark WARM stone (brown-plum, never pure black), warm amber glow of torches, lanterns and braziers, cool turquoise crystals as an accent, glowing violet/lilac fruit jam (thick glossy blackcurrant-grape jam) veins, blobs and drips. Strictly: no blood, no gore, no guts, no skulls or bone piles, no horror, not childish, not sci-fi, no neon, no pure black shadows, no blue-and-yellow flags or pennants. The ground is lighter than the walls, and the creatures contrast clearly with the floor.

Strictly: no text, no letters, no numbers, no runes that look like letters, no logos, no UI, no HUD, no health bars, no frame, no border, no watermark, no signature.
no text, no letters, no logos, no UI.
```

## alt/3-mobs-v1-scale-off.png (первая попытка 3-mobs)

```
Use your built-in image generation tool (image_gen) to generate exactly ONE image from the brief below. Do not draw it with code, scripts or SVG, do not edit other files. After generating, tell me the exact file path of the generated image. Brief:

Enemy lineup concept sheet on a plain neutral dark-warm taupe background (no scene), landscape 3:2. Six rank-and-file cave enemies of the Jam Baron's underground army standing in one row (or two rows of three), all drawn to the SAME consistent scale relative to each other and in the same painted style, each fully visible with a soft shadow beneath: 1) a cellar rat (small, fast, long tail), 2) a cave bat with spread wings (small body, big wings), 3) a jam slug (a slow, plump, glossy slug-blob made of purple jam), 4) a mushroom man (a stout walking mushroom with a fat cap and stubby legs), 5) a shield beetle (a chunky beetle with a thick armored plated shell like a shield on its front), 6) a spitter (a plump toad-like creature with swollen jam-filled cheeks that spits blobs of jam). Common mark of the whole army: every creature is smeared with violet jam splotches and drips and has glowing lilac eyes. Cute-menacing, not scary, not gory, readable distinct silhouettes from above and from the front. Natural creature colors (grey-brown fur, olive, beige, dark shell) mixed with violet jam. Characters are slightly stylized with soft rounded forms.

Style: polished hand-painted cartoon concept art for a browser action game: warm storybook painting with clean readable shapes, soft rounded forms, soft brushwork, gentle painterly texture, dense rich saturated colors. It is the same warm painted look as a cozy sunny seaside-town game, but the underground, night-time, slightly darker version. Mood: light dark fantasy without excess, atmospheric, mysterious and a little eerie, still charming. Palette: dark WARM stone (brown-plum, never pure black), warm amber glow of torches, lanterns and braziers, cool turquoise crystals as an accent, glowing violet/lilac fruit jam (thick glossy blackcurrant-grape jam) veins, blobs and drips. Strictly: no blood, no gore, no guts, no skulls or bone piles, no horror, not childish, not sci-fi, no neon, no pure black shadows, no blue-and-yellow flags or pennants. The ground is lighter than the walls, and the creatures contrast clearly with the floor.

Strictly: no text, no letters, no numbers, no runes that look like letters, no logos, no UI, no HUD, no health bars, no frame, no border, no watermark, no signature.
no text, no letters, no logos, no UI.
```

## alt/3-mobs-v2-bad-background.png (вторая попытка 3-mobs)

```
Use your built-in image generation tool (image_gen) to generate exactly ONE image from the brief below. Do not draw it with code, scripts or SVG, do not edit other files. After generating, tell me the exact file path of the generated image. Brief:

Enemy lineup concept sheet on a plain neutral dark-warm taupe background (no scene), landscape 3:2, arranged in two rows of three with ONE common ground line per row, and ONE consistent true-to-life relative scale across all six so that sizes can be compared directly. Six rank-and-file cave enemies of the Jam Baron's underground army, drawn in the same soft painted cartoon style with rounded friendly-menacing forms, each fully visible with a soft shadow beneath. CRITICAL SCALE RULE (draw them at these relative sizes): the mushroom man is the tallest, about 100 cm tall; the shield beetle about 80 cm long and 60 cm tall; the spitter toad about 60 cm tall; the jam slug about 60 cm long and low; the cellar rat is SMALL, only about 35 cm long, clearly less than half the height of the mushroom man; the bat's body is tiny (about 20 cm body, spread wings about 60 cm wide) and it hovers a little above the ground. Top row: 1) the cellar rat (small, fast, long tail), 2) the cave bat with spread wings, 3) the jam slug (slow plump glossy slug-blob made of purple jam). Bottom row: 4) the mushroom man (a stout walking mushroom with a fat cap and stubby legs), 5) the shield beetle (chunky beetle with a thick armored plated shell, a shield-like plate in front), 6) the spitter (a plump toad-like creature with swollen jam-filled cheeks). Common mark of the whole army: every creature is smeared with violet jam splotches and drips and has glowing lilac eyes. Cute-menacing, not scary, not gory. Soft rounded storybook painting, not photorealistic.

Style: polished hand-painted cartoon concept art for a browser action game: warm storybook painting with clean readable shapes, soft rounded forms, soft brushwork, gentle painterly texture, dense rich saturated colors. It is the same warm painted look as a cozy sunny seaside-town game, but the underground, night-time, slightly darker version. Mood: light dark fantasy without excess, atmospheric, mysterious and a little eerie, still charming. Palette: dark WARM stone (brown-plum, never pure black), warm amber glow of torches, lanterns and braziers, cool turquoise crystals as an accent, glowing violet/lilac fruit jam (thick glossy blackcurrant-grape jam) veins, blobs and drips. Strictly: no blood, no gore, no guts, no skulls or bone piles, no horror, not childish, not sci-fi, no neon, no pure black shadows, no blue-and-yellow flags or pennants. The ground is lighter than the walls, and the creatures contrast clearly with the floor.

Strictly: no text, no letters, no numbers, no runes that look like letters, no logos, no UI, no HUD, no health bars, no frame, no border, no watermark, no signature.
no text, no letters, no logos, no UI.
```
