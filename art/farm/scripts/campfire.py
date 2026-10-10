# Campfire: stone ring + wood (fits 1.4 x 1.4 box), flame and embers (separate, glow), seat log 1.8 x 0.45 (4 instances).
exec(open(LIB + '/props_common.py').read(), globals())
exec(open(LIB + '/crops.py').read(), globals())
exec(open(LIB + '/props.py').read(), globals())
reset()
objs = build_campfire()
fire, fl, embers, seat = objs
fit_all(objs, {'campfire': 760, 'campfire_seat': 180, 'campfire_flame': 300, 'campfire_embers': 160})  # v11: fire + 4 logs ~1.5k
report(objs)
save_blend('campfire')
to_origin(objs)
export_glb(objs, f'{GLB_DIR}/campfire.glb')
ex = []
for (x, y, rz) in ((0, -2.1, 0), (0, 2.1, 0), (-2.1, 0, math.pi / 2), (2.1, 0, math.pi / 2)):
    ex.append(dup(seat, (x, y, 0), rz))
seat.location = (0, 0, -60)
preview([fire, fl, embers] + ex, f'{PNG_DIR}/campfire.png', yaw=-30, pitch=30, margin=0.62)
for e in ex:
    bpy.data.objects.remove(e, do_unlink=True)
seat.location = (2.6, 0, 0)
save_blend('campfire')
print('FINAL campfire', {o.name: tris(o) for o in objs})
