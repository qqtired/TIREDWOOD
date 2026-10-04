# Фон вывески «Сезон рыбалки» (client/lobby/seasonsign.ts)

`season-board.webp` — нарисован 4 октября 2026 через Codex CLI (встроенный image_gen), один вызов, без надписей
(текст пишет игра на холсте шрифтом Rubik). Исходник — PNG 1536×1024.

Обработка (headless Chrome, canvas): 1024×568 — левая и правая полосы по 330 px исходника (сеть, рыбы, ракушки)
без искажений, середина с гладкими досками растянута по ширине; WebP с качеством 0,8 — 90 КБ.

## Промпт

```
Use your built-in image generation tool (image_gen) to create ONE image and save it as a PNG file at ./season-sign-bg.png in the current folder. Landscape, 1536x1024. Do not draw it with code, do not edit any other files.

Subject: the flat front face of a big old wooden fishing-village signboard, seen straight on (orthographic front view, no perspective, no background, no sky, no posts), the board fills the ENTIRE image edge to edge. Weathered sun-bleached horizontal planks in warm honey-brown and driftwood tones, visible wood grain and a few nail heads. A thick twisted hemp rope runs around the whole border as a frame, tied with sailor knots at the four corners. Decorations ONLY along the left and right edges and in the corners: a draped dark-green fishing net with red-and-white fishing floats in the top-left and bottom-right corners, two or three cheerful painted cartoon fish (a silver mackerel, a red mullet), a starfish and a couple of seashells near the left and right edges, a small coil of rope. The big central area (about 70 percent of the width and the middle 75 percent of the height) must stay calm and plain: smooth slightly lighter planks with no objects, no stains and no markings, because large text will be painted over it later in the game.

Style: polished hand-painted cartoon game art, warm storybook painting with clean readable shapes, soft brushwork, gentle painterly texture, rich natural saturated colors, bright cheerful sunlit mood of a small Black Sea seaside resort town, cozy and grounded. Not sci-fi, no neon, no fantasy magic glow, no darkness.

Strictly: no text, no letters, no numbers, no words, no logos, no symbols, no watermark, no signature. Avoid blue-and-yellow color combinations.
```
