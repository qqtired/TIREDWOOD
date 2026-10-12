# Dungeon evolutions — approved r7 sources

Owner approval 2026-10-12: integrate all eight r7 visuals into the forthcoming release, raise the beacon above the hat, add firefly abdomen glow.

Immutable source: reports/tiredwood-dungeon-waves-16-20-2026-10-11/evolutions-r7/blender/v1 and source/build-models.py in tired.solutions. Geometry and four authored clips (idle/run/attack/flight) are copied byte-for-byte. Actual clips contain preparation/recovery around attack midpoint; no separately named Fire/Recover/Upgrade clip is claimed.

Runtime: client/dungeon/evolutions.ts reuses the rigid pose baker, with bounded instance batches. Beacon clearance and firefly emissive/halo are runtime-only changes. No new lights or postprocessing. Non-evolved weapons and gameplay are unchanged.

| File | Bytes | SHA256 |
|---|---:|---|
| beam_evo.glb | 68920 | 84cc07d2cd51bd37c853b02f103c9189f8122ace585480886fa37ac741b534b5 |
| charges_evo.glb | 79100 | 3a6f4a2faae7b1459030a06cdda1bf1fd6b2c0b84ba90c9bfd035ce3d87add56 |
| embers_evo.glb | 87628 | 8690a8b5f74026bac2a483744df17f8da029256237d219170d375a1293028800 |
| fireflies_evo.glb | 89872 | 3011f8b3e688726f3f6758a5016700ea4cdd105dc2c469797129dd64164919fb |
| lantern_evo.glb | 83300 | 3288809bb8887fc5a3a9e4ae0c4c8286f0461625080b3ea202f357a13d65b21d |
| pickaxe_evo.glb | 93708 | 4322bf7875ca757dfd9ab7a764748079396a78a4dd59af488d0c481b3447a158 |
| spark_evo.glb | 46948 | 1e411668e39f2bdd83c94ad5bf88f91ccd52333d005f7747ef59d48c6fde181a |
| stalactites_evo.glb | 29472 | df602b31acc9fdaf28bec6d17f7f6b1fecb42e340a502033bb21e29a9bff7515 |
