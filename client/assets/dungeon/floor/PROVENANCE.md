# Текстуры пола «Подземелья» — происхождение

Нарисованы 10 октября 2026 через **Codex CLI, встроенный инструмент `image_gen`** — так же, как концепт-арт
(`docs/survivors/art/PROVENANCE.md`): `codex exec --skip-git-repo-check -s workspace-write -C <папка> -o <лог> -`,
промпт на stdin, одна картинка на вызов, ключи не трогали. Исходники Codex — PNG 1254 × 1254 в
`~/.codex/generated_images/…` (в репозиторий не кладём, путь ниже). Кодом ничего не рисовали, руками не правили.
Надписей нет (проверено глазами).

Каждый промпт: **вступление** (просим `image_gen`, одну картинку) + **описание пола** (своё у биома) + **общая часть**
(бесшовная плитка строго сверху, ровный свет, низкий контраст, крупные спокойные формы; стиль концепт-арта и
моделей — рисованный, умеренно стилизованный, не фото, не неон; без надписей). Промпты ниже — целиком, ровно как ушли
на stdin.

| Файл | Исходник Codex (`~/.codex/generated_images/…`) | Дата | Источник |
|---|---|---|---|
| `cellars.jpg` | `01a126f5-607d-7fe1-9fd7-4e8dcbf93f0c/exec-151e90a6-e265-478c-9708-578591772d72.png` (1254 × 1254) | 2026-10-10 | Codex CLI image_gen, погреба |
| `mushrooms.jpg` | `01a126f7-62d3-76e3-8644-e129a08ecc55/exec-fc213754-e873-4415-a86b-29647da49c71.png` (1254 × 1254) | 2026-10-10 | Codex CLI image_gen, грибы, вторая попытка |
| `crystals.jpg` | `01a126f5-607d-7ad3-b457-f4f13ccd194e/exec-38fb2916-fcdc-42a5-840a-9c0222096b5e.png` (1254 × 1254) | 2026-10-10 | Codex CLI image_gen, кристальный грот |
| `mine.jpg` | `01a126f5-607d-7cf2-8ca3-e74d45b907a4/exec-2276cc47-03e4-4ec7-be9e-8dd88d5c8e76.png` (1254 × 1254) | 2026-10-10 | Codex CLI image_gen, шахта |
| `jam.jpg` | `01a126f5-6139-7be0-9e36-f599ab36f2b2/exec-c7664211-5ec4-4b2a-b3a4-5cae5cd77926.png` (1254 × 1254) | 2026-10-10 | Codex CLI image_gen, варенные жилы |
| — (не взята) | `01a126f5-612c-7e23-9516-03df4d6d1f9f/exec-f6bb935d-f746-49dd-a748-b53b293325a3.png` | 2026-10-10 | первая попытка грибов: мох читался как кусты сверху, нити грибницы слишком яркие |

## Что сделано с файлами

Скрипт `tools/survivors/floor/make-tiles.mjs` (node, без пакетов; конвертация — системный `sips`):

1. PNG → BMP (`sips`), уменьшение 1254 → **1024 px** площадным фильтром с заворотом краёв (чтобы стык плитки не портился).
2. Проверка стыка: разрыв на краю против обычной разницы соседних пикселей. Codex дал плитки бесшовными по рисунку
   (проверено плиткой 3 × 3), но крайний столбец/строка чуть отличались по тону — тонкая линия на стыке при увеличении.
   Её смягчили размытием ±4 px поперёк стыка (сила спадает от стыка). Смешивание со сдвинутой копией (на случай
   настоящего шва) не понадобилось.
3. BMP → **JPEG, качество 80** (`sips`). Мип-карты строит three.js при загрузке.
4. Скрипт печатает средний цвет каждой текстуры (линейный) — он записан в `FLOOR_MEAN` в `client/dungeon/world.ts`.
   **Заменили картинку — перезапустите скрипт и обновите `FLOOR_MEAN`.**

Итог: 5 × JPEG 1024 × 1024, всего ≈ 1,3 МБ.

| Файл | Размер |
|---|---|
| `cellars.jpg` | 238 КБ |
| `mushrooms.jpg` | 315 КБ |
| `crystals.jpg` | 229 КБ |
| `mine.jpg` | 302 КБ |
| `jam.jpg` | 223 КБ |

Как пол их рисует (`client/dungeon/world.ts`, `worldlink.ts`): вес зоны лежит в вершине пола, текстура привязана
к мировым x, z с периодом 10 м (делит 240 — шва на склейке тора нет), второй слой той же текстуры повёрнут на 90°
с периодом 240/22 м и проступает по пятнам 10–20 м (светлый камень поверх тёмного шва) — против явного повтора.
Пол = цвет вершины (тон зоны, пятна света, тени) × текстура / её средний цвет, поэтому общий тон зоны прежний.

## Промпты

### cellars.jpg

```
Use your built-in image generation tool (image_gen) to generate exactly ONE image from the brief below. Do not draw it with code, scripts or SVG, do not edit other files. After generating, tell me the exact file path of the generated image. Brief:

Floor of an old wine cellar: worn, irregular, large rounded flagstone slabs with a few small patches of old laid brick, about 5 to 6 slabs across the width of the image, slabs of slightly different warm sandy-brown, taupe and dusty-plum stone, soft worn rounded edges, narrow mortar joints only a little darker than the stones, a few subtle hairline cracks and faint scuffs. Calm and even, no puddles, no stains, no objects.

Square 1:1 seamless tileable ground texture for a 3D top-down action game, seen from straight above (orthographic, camera pointing exactly down, no perspective, no horizon, no walls, nothing standing up, no props, no characters). The texture must tile seamlessly: the left edge continues into the right edge and the top edge continues into the bottom edge, with no border, no frame, no vignette, no darker corners. Evenly lit with flat soft ambient light: no light source, no cast shadows, no glow spots, no specular highlights, the same average brightness everywhere in the image. Low contrast, medium values (mid-tone, never black, never bright white): this is a floor that game characters and spell effects must read clearly on top of. Large calm shapes with a little soft painterly detail inside them; no busy high-frequency noise, no tiny repeated speckles, no single eye-catching feature that would make the repetition obvious.

Style: hand-painted stylized game texture, like the painted ground textures of a cozy storybook 3D game: soft brushwork, clean readable rounded shapes, gentle painterly texture, warm muted colors. Moderately stylized, not photorealistic, not a photo scan, not pixel art, no black outlines, not neon, not sci-fi. Mood: underground cave of a light dark fantasy game, warm and slightly mysterious. Base palette: dark WARM stone, brown-plum and warm taupe (light floor stone around #9C7B5B, darkest joints around #3A2C25), never pure black.

Strictly: no text, no letters, no numbers, no runes that look like letters, no logos, no symbols, no UI, no frame, no border, no watermark, no signature.
no text, no letters, no logos, no UI.
```

### mushrooms.jpg

```
Use your built-in image generation tool (image_gen) to generate exactly ONE image from the brief below. Do not draw it with code, scripts or SVG, do not edit other files. After generating, tell me the exact file path of the generated image. Brief:

Floor of a damp mushroom cave: soft dark earthy brown soil, partly covered by large soft irregular patches of a FLAT, velvety, very low moss carpet in muted olive-green (around #5E7A3A, desaturated, no bright green) that lies flat on the ground like felt (not bushes, not shrubs, not leaves, not clumps of foliage, nothing that looks like tree canopy seen from above), with faint thin pale-cream threads of mycelium spreading in soft branching lines through the soil (thin and low contrast, like faint lace), and a few small flat half-buried pebbles. No standing mushrooms, no plants sticking up, nothing glowing, just the damp ground. Colors: earthy warm brown, muted moss olive, small touches of pale cream.

Square 1:1 seamless tileable ground texture for a 3D top-down action game, seen from straight above (orthographic, camera pointing exactly down, no perspective, no horizon, no walls, nothing standing up, no props, no characters). The texture must tile seamlessly: the left edge continues into the right edge and the top edge continues into the bottom edge, with no border, no frame, no vignette, no darker corners. Evenly lit with flat soft ambient light: no light source, no cast shadows, no glow spots, no specular highlights, the same average brightness everywhere in the image. Low contrast, medium values (mid-tone, never black, never bright white): this is a floor that game characters and spell effects must read clearly on top of. Large calm shapes with a little soft painterly detail inside them; no busy high-frequency noise, no tiny repeated speckles, no single eye-catching feature that would make the repetition obvious.

Style: hand-painted stylized game texture, like the painted ground textures of a cozy storybook 3D game: soft brushwork, clean readable rounded shapes, gentle painterly texture, warm muted colors. Moderately stylized, not photorealistic, not a photo scan, not pixel art, no black outlines, not neon, not sci-fi. Mood: underground cave of a light dark fantasy game, warm and slightly mysterious. Base palette: dark WARM stone, brown-plum and warm taupe (light floor stone around #9C7B5B, darkest joints around #3A2C25), never pure black.

Strictly: no text, no letters, no numbers, no runes that look like letters, no logos, no symbols, no UI, no frame, no border, no watermark, no signature.
no text, no letters, no logos, no UI.
```

### crystals.jpg

```
Use your built-in image generation tool (image_gen) to generate exactly ONE image from the brief below. Do not draw it with code, scripts or SVG, do not edit other files. After generating, tell me the exact file path of the generated image. Brief:

Floor of a crystal grotto: dark plum-grey and warm cool-grey rock with large flat fractured stone planes separated by soft shallow cracks, faint thin muted lilac-lavender mineral veins winding through the stone, and a few tiny flat embedded turquoise crystal flecks (flat in the rock, not sticking up, not glowing). Slightly cooler than a normal cave floor but still warm-grey: not blue, not black, not shiny.

Square 1:1 seamless tileable ground texture for a 3D top-down action game, seen from straight above (orthographic, camera pointing exactly down, no perspective, no horizon, no walls, nothing standing up, no props, no characters). The texture must tile seamlessly: the left edge continues into the right edge and the top edge continues into the bottom edge, with no border, no frame, no vignette, no darker corners. Evenly lit with flat soft ambient light: no light source, no cast shadows, no glow spots, no specular highlights, the same average brightness everywhere in the image. Low contrast, medium values (mid-tone, never black, never bright white): this is a floor that game characters and spell effects must read clearly on top of. Large calm shapes with a little soft painterly detail inside them; no busy high-frequency noise, no tiny repeated speckles, no single eye-catching feature that would make the repetition obvious.

Style: hand-painted stylized game texture, like the painted ground textures of a cozy storybook 3D game: soft brushwork, clean readable rounded shapes, gentle painterly texture, warm muted colors. Moderately stylized, not photorealistic, not a photo scan, not pixel art, no black outlines, not neon, not sci-fi. Mood: underground cave of a light dark fantasy game, warm and slightly mysterious. Base palette: dark WARM stone, brown-plum and warm taupe (light floor stone around #9C7B5B, darkest joints around #3A2C25), never pure black.

Strictly: no text, no letters, no numbers, no runes that look like letters, no logos, no symbols, no UI, no frame, no border, no watermark, no signature.
no text, no letters, no logos, no UI.
```

### mine.jpg

```
Use your built-in image generation tool (image_gen) to generate exactly ONE image from the brief below. Do not draw it with code, scripts or SVG, do not edit other files. After generating, tell me the exact file path of the generated image. Brief:

Floor of an old mine gallery: packed dry earth and fine gravel with scattered small flat stones and faint shallow cart ruts, plus one or two faint, half-buried, weathered dark wooden sleeper planks lying across, mostly covered with dust and soil so they read as soft low-contrast traces (no rails, no metal, no nails). Colors: dusty ochre-brown earth, grey-brown gravel, dark weathered brown wood.

Square 1:1 seamless tileable ground texture for a 3D top-down action game, seen from straight above (orthographic, camera pointing exactly down, no perspective, no horizon, no walls, nothing standing up, no props, no characters). The texture must tile seamlessly: the left edge continues into the right edge and the top edge continues into the bottom edge, with no border, no frame, no vignette, no darker corners. Evenly lit with flat soft ambient light: no light source, no cast shadows, no glow spots, no specular highlights, the same average brightness everywhere in the image. Low contrast, medium values (mid-tone, never black, never bright white): this is a floor that game characters and spell effects must read clearly on top of. Large calm shapes with a little soft painterly detail inside them; no busy high-frequency noise, no tiny repeated speckles, no single eye-catching feature that would make the repetition obvious.

Style: hand-painted stylized game texture, like the painted ground textures of a cozy storybook 3D game: soft brushwork, clean readable rounded shapes, gentle painterly texture, warm muted colors. Moderately stylized, not photorealistic, not a photo scan, not pixel art, no black outlines, not neon, not sci-fi. Mood: underground cave of a light dark fantasy game, warm and slightly mysterious. Base palette: dark WARM stone, brown-plum and warm taupe (light floor stone around #9C7B5B, darkest joints around #3A2C25), never pure black.

Strictly: no text, no letters, no numbers, no runes that look like letters, no logos, no symbols, no UI, no frame, no border, no watermark, no signature.
no text, no letters, no logos, no UI.
```

### jam.jpg

```
Use your built-in image generation tool (image_gen) to generate exactly ONE image from the brief below. Do not draw it with code, scripts or SVG, do not edit other files. After generating, tell me the exact file path of the generated image. Brief:

Floor of the jam cave: warm brown-plum stone floor of irregular worn flat slabs with soft joints, with several old dried jam stains soaked into the stone: soft-edged, matte, flat, darkened violet-purple smears and drips (deep purple around #6B2A8C, muted toward brown), dried and absorbed into the stone, not glossy, not liquid puddles, not glowing, low contrast against the stone.

Square 1:1 seamless tileable ground texture for a 3D top-down action game, seen from straight above (orthographic, camera pointing exactly down, no perspective, no horizon, no walls, nothing standing up, no props, no characters). The texture must tile seamlessly: the left edge continues into the right edge and the top edge continues into the bottom edge, with no border, no frame, no vignette, no darker corners. Evenly lit with flat soft ambient light: no light source, no cast shadows, no glow spots, no specular highlights, the same average brightness everywhere in the image. Low contrast, medium values (mid-tone, never black, never bright white): this is a floor that game characters and spell effects must read clearly on top of. Large calm shapes with a little soft painterly detail inside them; no busy high-frequency noise, no tiny repeated speckles, no single eye-catching feature that would make the repetition obvious.

Style: hand-painted stylized game texture, like the painted ground textures of a cozy storybook 3D game: soft brushwork, clean readable rounded shapes, gentle painterly texture, warm muted colors. Moderately stylized, not photorealistic, not a photo scan, not pixel art, no black outlines, not neon, not sci-fi. Mood: underground cave of a light dark fantasy game, warm and slightly mysterious. Base palette: dark WARM stone, brown-plum and warm taupe (light floor stone around #9C7B5B, darkest joints around #3A2C25), never pure black.

Strictly: no text, no letters, no numbers, no runes that look like letters, no logos, no symbols, no UI, no frame, no border, no watermark, no signature.
no text, no letters, no logos, no UI.
```

### Первая попытка грибов (не взята)

```
Use your built-in image generation tool (image_gen) to generate exactly ONE image from the brief below. Do not draw it with code, scripts or SVG, do not edit other files. After generating, tell me the exact file path of the generated image. Brief:

Floor of a damp mushroom cave: soft dark earthy brown soil with large soft irregular patches of muted olive-green moss (around #5E7A3A, desaturated), faint pale cream threads of mycelium spreading in thin soft branching lines through the soil, and a few small flat half-buried pebbles. No standing mushrooms, no leaves or plants sticking up, nothing glowing, just the damp ground. Colors: earthy warm brown, muted moss green, small touches of pale cream.

Square 1:1 seamless tileable ground texture for a 3D top-down action game, seen from straight above (orthographic, camera pointing exactly down, no perspective, no horizon, no walls, nothing standing up, no props, no characters). The texture must tile seamlessly: the left edge continues into the right edge and the top edge continues into the bottom edge, with no border, no frame, no vignette, no darker corners. Evenly lit with flat soft ambient light: no light source, no cast shadows, no glow spots, no specular highlights, the same average brightness everywhere in the image. Low contrast, medium values (mid-tone, never black, never bright white): this is a floor that game characters and spell effects must read clearly on top of. Large calm shapes with a little soft painterly detail inside them; no busy high-frequency noise, no tiny repeated speckles, no single eye-catching feature that would make the repetition obvious.

Style: hand-painted stylized game texture, like the painted ground textures of a cozy storybook 3D game: soft brushwork, clean readable rounded shapes, gentle painterly texture, warm muted colors. Moderately stylized, not photorealistic, not a photo scan, not pixel art, no black outlines, not neon, not sci-fi. Mood: underground cave of a light dark fantasy game, warm and slightly mysterious. Base palette: dark WARM stone, brown-plum and warm taupe (light floor stone around #9C7B5B, darkest joints around #3A2C25), never pure black.

Strictly: no text, no letters, no numbers, no runes that look like letters, no logos, no symbols, no UI, no frame, no border, no watermark, no signature.
no text, no letters, no logos, no UI.
```
