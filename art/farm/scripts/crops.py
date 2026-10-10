# Crops: one GLB per crop (client/assets/farm/models/crop_<id>.glb) with objects stage0..stage3.
# ids = design-v11 §16.1. OPTS = list of crop ids (empty = all 19); 'test' renders without exporting.
# Triangle budgets per stage (v11: 300-400 / 400-600 / 500-900 / 600-900, big crops up to 1500,
# field average <= 600 per bed) are enforced by collapse decimation in crop_finalize -> fit_tris.
exec(open(LIB + '/crops.py').read(), globals())

NORMAL = [350, 500, 680, 760]
BIG = [400, 600, 1100, 1400]
CROPS = {  # id: (builder, preview margin, look_z, budget)
    'radish': (build_radish, 0.6, None, NORMAL),
    'wheat': (build_wheat, 0.62, None, NORMAL),
    'lettuce': (build_lettuce, 0.6, None, NORMAL),
    'onion': (build_onion, 0.6, None, NORMAL),
    'pumpkin': (build_pumpkin, 0.6, None, BIG),
    'carrot': (build_carrot, 0.6, None, NORMAL),
    'sunflower': (build_sunflower, 0.78, 0.7, NORMAL),
    'strawberry': (build_strawberry, 0.6, None, NORMAL),
    'giant-mushroom': (build_giant_mushroom, 0.64, 0.25, BIG),
    'dill': (build_dill, 0.64, None, NORMAL),
    'chili': (build_chili, 0.62, None, NORMAL),
    'crystal': (build_crystal_flower, 0.62, None, NORMAL),
    'microgreens': (build_microgreens, 0.6, None, NORMAL),
    'lotus': (build_moon_lotus, 0.62, None, NORMAL),
    'life-tree': (build_tree_of_life, 0.96, 0.75, BIG),
    'golden-apple': (build_golden_apple, 0.96, 0.75, BIG),
    'dragon-fruit': (build_dragon_fruit, 0.72, 0.5, BIG),
    'star-flower': (build_star_flower, 0.62, None, NORMAL),
    'mythic-mushroom': (build_mythic_mushroom, 0.66, 0.3, BIG),
}
TEST = 'test' in OPTS
names = [o for o in OPTS if o in CROPS] or list(CROPS)
for name in names:
    fn, m, lz, budget = CROPS[name]
    reset()
    st = fn()
    if TEST:
        crop_test(name, st, margin=m, look_z=lz)
    else:
        crop_finalize(name, st, margin=m + 0.12, look_z=lz, budget=budget)
