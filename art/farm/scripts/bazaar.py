# Bazaar (design-v11 §16.3): seed_stall (Семечкин, 3 x 1.8 m, 3-4k) and grib_kiosk (Дядюшка Гриб, 3 x 1.8 m, 4-5k,
# + grib_scales: beam with pans, origin on the pivot, rocks). Front = Blender +Y = game -Z at yaw 0
# (layout: Семечкин yaw pi -> counter faces south; Гриб yaw pi/2 -> window faces west).
exec(open(LIB + '/props_common.py').read(), globals())
exec(open(LIB + '/crops.py').read(), globals())
exec(open(LIB + '/carts.py').read(), globals())
exec(open(LIB + '/bazaar.py').read(), globals())

reset()
st = build_seed_stall()
attach(st, 'attach_npc', (0.0, -0.4, 0.0))
fit_all([st], {'seed_stall': 3900})
report([st])
save_blend('seed_stall')
export_glb([st], f'{GLB_DIR}/seed_stall.glb')
preview([st], f'{PNG_DIR}/seed_stall.png', yaw=180 - 30, pitch=16, margin=0.82)
save_blend('seed_stall')
print('FINAL seed_stall', tris(st))

reset()
k, sc, piv = build_grib_kiosk()
attach(k, 'attach_scales', tuple(piv))
attach(k, 'attach_npc', (0.0, -0.15, 0.0))  # inside, 0.15 m behind the centre
objs = [k, sc]
fit_all(objs, {'grib_kiosk': 4700})
report(objs)
save_blend('grib_kiosk')
to_origin(objs)
export_glb(objs, f'{GLB_DIR}/grib_kiosk.glb')
sc.location = piv
# preview only: a jelly-sized stand-in (1.05 x 1.58 m) where the NPC stands
J = Builder(9)
J.sphere((0, -0.15, 0.79), 1.0, scale=(0.525, 0.525, 0.79), segs=16, rings=10, col=0xb39ddb, mat='farm_gloss')
jp = J.build('_jelly_preview', ground_ao=None)
preview(objs + [jp], f'{PNG_DIR}/grib_kiosk.png', yaw=180 - 22, pitch=8, margin=0.82)
bpy.data.objects.remove(jp, do_unlink=True)
save_blend('grib_kiosk')
print('FINAL grib_kiosk', {o.name: tris(o) for o in objs})
