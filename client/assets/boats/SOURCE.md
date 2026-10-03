# Sport boat source and license

- Author: Kenney.
- Official asset page: https://kenney.nl/assets/watercraft-kit
- Package: Watercraft Kit 2.1, created 2024-04-19; official page lists Creative Commons CC0.
- Download source: https://kenney.nl/media/pages/assets/watercraft-kit/a335cfed49-1713519620/kenney_watercraft-pack.zip
- Selected model: `Models/GLB format/boat-speed-a.glb` (16,520 bytes).
- Required original palette: `Models/GLB format/Textures/colormap.png` (8,814 bytes), baked offline; not required at runtime.
- License: `LICENSE-Kenney.txt`, original package license retained verbatim.
- Retrieved 2026-10-03 using HTTP byte ranges and per-entry ZIP CRC32 verification. The full package was not imported into the project. Preview candidates were inspected only in temporary files.

## Local derivative

`kenney-speed-a.glb` (21,260 bytes) keeps the original POSITION/NORMAL/UV/index buffers and triangle topology (156 triangles). Original palette colors were sampled into linear RGB `COLOR_0`; `_BOAT_PAINT` marks only the original blue hull palette for local material adaptation. Embedded/external texture references are removed, so GLTFLoader needs no image, blob URL, network host, or texture decoder. This is an asset-format conversion; the runtime retains the authored hard/smooth surface normals.

Conversion tool: `tools/boat-assets/prepare-watercraft.mjs`.

SHA-256:

- Original model: `d6d5605408e8be888551588b4c73d2953414250e2f29864ee133e9ba5ee2e8b2`
- Converted model: `517c16cd990fd8e50584dbc4908119bf9f67fb0e049ad20709335d053b4395dd`

Runtime additions in `client/boatrace/model.ts`: ivory finish on marked hull faces, livery rubrail, cockpit floor/cushions, wrap glazing, frame, gauges, steering wheel, outboard/propeller, cleats, fenders and race-number plates. Scale/orientation changes and these detail layers are local Game Opus work. No paid service, runtime hotlink, downloaded code, or third-party character asset is used.
