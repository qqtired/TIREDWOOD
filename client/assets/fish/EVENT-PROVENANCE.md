# Event fish image provenance

Generated on 2026-10-03 for Roman's approved two extra event-only real marine fish.

Actual tool: `image_gen.imagegen` (callable `image_gen__imagegen`). The requested `codex_cli` image capability was absent from the active callable tool inventory; the root-authorized built-in fallback was used. No CLI/authentication/model changes were made. The generation API did not expose a model/service-tier argument, so none is claimed.

Two independent new-image calls used `transparent_background: true`. No regeneration or image editing was performed. Existing `tuna.webp`, `whiteshark.webp` and `angler.webp` were inspected with `view_image` for the naturalistic illustrated lateral-profile style. Reference images were not passed as edit targets.

| ID | Species | Game rarity | Final file | Dimensions | Bytes |
| --- | --- | --- | --- | --- | --- |
| bluemarlin | Синий марлин / Atlantic blue marlin / Makaira nigricans | Legend | bluemarlin.webp | 1918 × 820 | 696710 |
| greenlandshark | Гренландская акула / Greenland shark / Somniosus microcephalus | Myth | greenlandshark.webp | 2172 × 724 | 998468 |

Original PNG copies are preserved in `event-originals-2026-10-03/`. Original library filenames, SHA-256 hashes, alpha bounds, exact prompts and verification metadata are recorded in `EVENT-PROVENANCE.json`.

Only lossless file-format conversion was applied: Pillow WebP with `lossless=True, quality=100, method=6, exact=True`. No resize, crop, recolour or hand-drawn replacement. Original copies are hash-identical to the generated files; decoded WebP and PNG RGBA pixels are byte-for-byte equal, including alpha.

Scientific references:

- [NOAA Fisheries — Pacific Blue Marlin](https://www.fisheries.noaa.gov/species/pacific-blue-marlin) confirms Makaira nigricans, cobalt/silver appearance, prominent dorsal fin and spear bill; its range includes Atlantic waters.
- [NOAA Ocean Exploration — Greenland Shark](https://oceanexplorer.noaa.gov/multimedia/video-playlist-ex1304-greenlandshark/) documents a Greenland shark in a marine ROV observation.
- [ITIS — Makaira nigricans](https://www.itis.gov/servlet/SingleRpt/SingleRpt?search_topic=Scientific_Name&search_value=Makaira+nigricans) and [NOAA Library — Greenland shark study](https://repository.library.noaa.gov/view/noaa/8714/noaa_8714_DS1.pdf) were supplied and checked by the rules worker for taxonomy.

## Full prompt: bluemarlin

```text
Use case: scientific-educational.
Asset type: Game Opus fishing inventory and catch-card sprite, a unique raster illustration.
Primary request: Generate exactly ONE real Atlantic blue marlin (Makaira nigricans), complete animal, anatomically recognizable, isolated on a genuinely transparent background.
Style/medium: naturalistic hand-painted marine field-guide specimen art with fine tactile brushwork, understated realistic shading, crisp silhouette and detailed fins, matching realistic illustrated fish inventory icons. No cartoon exaggeration or vector simplification.
Subject anatomy: muscular elongated streamlined body, very long round spear-like upper-jaw bill, clearly shorter lower jaw, vivid cobalt-blue back fading to silvery white belly, faint blue vertical flank bars, steep high pointed front of first dorsal fin sweeping down along the back, a small second dorsal fin, slender pointed pectoral fins, and a strong deep crescent forked tail. Make it visually distinct from a swordfish or a sailfish; do not give it an enormous full-body sail.
Composition/framing: broad horizontal canvas, strict lateral profile facing LEFT, head and spear bill on the left and tail on the right; fish level and centered, entire bill, all fins and entire tail visible. Fish spans about 90 percent of canvas width, very small transparent margins, clean silhouette readable at small inventory-icon size.
Lighting/mood: soft neutral specimen lighting, subtle natural metallic silver sheen without glow.
Scene/backdrop: nothing except transparent alpha, no seabed, water, bubbles, floor or cast shadow.
Text: none.
Constraints: a single fish only; actual marine species, normal healthy real anatomy; no rarity badge, halo, gold decoration, fantasy body parts, props, hook, line, frame, captions, text or watermark. Preserve genuine transparency around the complete fish.
```

## Full prompt: greenlandshark

```text
Use case: scientific-educational.
Asset type: Game Opus fishing inventory and catch-card sprite, a unique raster illustration.
Primary request: Generate exactly ONE real Greenland shark (Somniosus microcephalus), complete animal, anatomically recognizable, isolated on a genuinely transparent background.
Style/medium: naturalistic hand-painted marine field-guide specimen art with fine tactile brushwork, understated realistic shading, crisp silhouette and detailed fins, matching realistic illustrated fish inventory icons. No cartoon exaggeration or vector simplification.
Subject anatomy: heavy thickset elongated sleeper-shark body, short broad rounded blunt snout, small dark lateral eye without a parasite, a small closed slightly underslung mouth, five short gill slits behind the head, two small low rounded dorsal fins well separated and positioned toward the rear half of body, broad subdued rounded pectoral fins, pelvic fins, no anal fin, asymmetric shark tail with a longer upper lobe and shorter lower lobe. Dull charcoal-grey to brown-grey mottled rough skin, pale muted grey-brown underside; realistic subtle scarring and sparse irregular darker spots. It must look like a Greenland sleeper shark with a blunt nose and small dorsals, visibly unlike a great white shark, with no pointed triangular great-white dorsal fin and no sharp white/black colour division.
Composition/framing: broad horizontal canvas, strict lateral profile facing LEFT, rounded head on the left and tail on the right; animal level and centered, entire head, all fins and entire tail visible. Fish spans about 90 percent of canvas width, very small transparent margins, clean silhouette readable at small inventory-icon size.
Lighting/mood: soft neutral specimen lighting; muted cold marine colours, no glow.
Scene/backdrop: nothing except transparent alpha, no seabed, water, bubbles, floor or cast shadow.
Text: none.
Constraints: a single real shark only, normal healthy real anatomy; no rarity badge, halo, gold decoration, fantasy body parts, props, hook, line, frame, captions, text or watermark. Preserve genuine transparency around the complete fish.
```

Both source images were visually inspected for the intended species, complete body, no captions and a transparent background. This is game specimen artwork, not a scientific anatomical plate. Desktop/mobile rendering, game rules and release acceptance remain the integration owner's checks.

