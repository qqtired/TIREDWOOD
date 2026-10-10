# Beehive on a stand with flowers around (0.7 x 0.7 m core), plus bee and bee_wings as separate objects for animation.
exec(open(LIB + '/props_common.py').read(), globals())
exec(open(LIB + '/crops.py').read(), globals())
exec(open(LIB + '/extras.py').read(), globals())
reset()
hive = build_hive()
bee, wings = build_bee()
attach(hive, 'attach_entrance', (0, -0.3, 0.37))
attach(bee, 'attach_wings', (0, 0, 0))
objs = [hive, bee, wings]
fit_all(objs, {'hive': 1500})  # v11: hive 1.5k, bee ~150 (built low-poly)
report(objs)
save_blend('hive')
to_origin(objs)
export_glb(objs, f'{GLB_DIR}/hive.glb')
ex = []
rng = random.Random(4)
for k in range(6):
    p = (rng.uniform(-0.45, 0.45), rng.uniform(-0.6, -0.2), rng.uniform(0.45, 1.1))
    s = 1.6
    b = dup(bee, p, rng.uniform(0, 6.28)); b.scale = (s, s, s); ex.append(b)
    w = dup(wings, p, b.rotation_euler.z); w.scale = (s, s, s); ex.append(w)
bee.location = (0, 0, -60); wings.location = (0, 0, -60)
preview([hive] + ex, f'{PNG_DIR}/hive.png', yaw=-24, pitch=18, margin=0.7)
for e in ex:
    bpy.data.objects.remove(e, do_unlink=True)
bee.location = (0.9, 0, 0.6); wings.location = (0.9, 0, 0.6)
save_blend('hive')
# close-up of the bee for the overview
bee.location = (0, 0, 0); wings.location = (0, 0, 0)
hive.location = (0, 0, -60)
preview([bee, wings], f'{PNG_DIR}/bee.png', yaw=-50, pitch=22, margin=0.9)
hive.location = (0, 0, 0); bee.location = (0.9, 0, 0.6); wings.location = (0.9, 0, 0.6)
print('FINAL hive', {o.name: tris(o) for o in objs})
