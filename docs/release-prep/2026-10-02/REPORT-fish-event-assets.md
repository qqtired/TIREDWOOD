# Event fish assets — completed bounded work

2026-10-03. Ownership: two new fish sprites and provenance only.

- Added `client/assets/fish/bluemarlin.webp`: Синий марлин / Makaira nigricans, Legend, 1918×820, 696710 bytes.
- Added `client/assets/fish/greenlandshark.webp`: Гренландская акула / Somniosus microcephalus, Myth, 2172×724, 998468 bytes.
- Preserved generated originals in `client/assets/fish/event-originals-2026-10-03/{bluemarlin,greenlandshark}.png`.
- Added `client/assets/fish/EVENT-PROVENANCE.md` and `EVENT-PROVENANCE.json` with exact prompts, actual tool, sources, dimensions, hashes and alpha verification.

Two unique raster images were generated with the built-in ImageGen tool and genuine transparency. The requested codex_cli image capability was absent from the active callable inventory; root-authorized fallback was used and explicitly recorded. The generation tool did not expose model/tier controls. No unsupported CLI model attempt or authentication change.

Fresh verification: original SHA256 matches generated library source; both WebPs reopen successfully and match original PNG RGBA pixels byte-for-byte after lossless conversion; alpha ranges are 0..255, with 1159463/928320 fully transparent pixels. Visually inspected complete lateral-profile animals: cobalt/silver marlin with spear bill and dorsal crest; stocky grey-brown sleeper shark with blunt snout and two small dorsals. No hand-drawn substitute, resize or crop.

Both source assets retain full generated resolution, so combined WebP payload is 1,695,178 bytes; resizing was outside the allowed conversion-only scope. UI worker was notified of exact .webp names to match the existing sprite glob.

No UI/shared rules/server code or existing assets edited. No server/browser/full gates run. Desktop and basic mobile acceptance remain root's integration checks; this report does not claim those passed.

