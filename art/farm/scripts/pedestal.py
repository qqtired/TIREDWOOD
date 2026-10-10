# Tree pedestal (design-v11 §16.3, 2-3k): boss_plinth 4 x 4 x 0.3 stone platform (always) + one stump state:
# boss_stump (sleeping), boss_stump_cracked (awake: split open, roots unfolding; the boss tree grows from it),
# boss_stump_bloom (after the full bloom). The stump sign faces -Y (game -Z at yaw 0). Plinth top = 0.3 m.
exec(open(LIB + '/props_common.py').read(), globals())
exec(open(LIB + '/crops.py').read(), globals())
exec(open(LIB + '/carts.py').read(), globals())
exec(open(LIB + '/decor.py').read(), globals())
reset()
pl = build_plinth()
st = [build_stump(s) for s in ('sleep', 'cracked', 'bloom')]
objs = [pl] + st
fit_all(objs, {'boss_plinth': 900, 'boss_stump': 900, 'boss_stump_cracked': 1100, 'boss_stump_bloom': 1300})
report(objs)
save_blend('pedestal')
to_origin(objs)
export_glb(objs, f'{GLB_DIR}/pedestal.glb')
# preview: the three stump states side by side on one plinth (in game only one is shown at a time)
for o, x in zip(st, (-1.35, 0.0, 1.35)):
    o.location = (x, 0.3, 0.3)
    o.scale = (0.82, 0.82, 0.82)
preview(objs, f'{PNG_DIR}/pedestal.png', yaw=-10, pitch=24, margin=0.6, look_z=0.5)
for o in st:
    o.scale = (1, 1, 1)
save_blend('pedestal')
print('FINAL pedestal', {o.name: tris(o) for o in objs})
