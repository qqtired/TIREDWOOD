# Well (centre of the farm) with crank, rope, bucket, weathervane; trough (4 instances around, 1.95 m from centre).
exec(open(LIB + '/props_common.py').read(), globals())
exec(open(LIB + '/crops.py').read(), globals())
exec(open(LIB + '/props.py').read(), globals())
reset()
well, crank, rope_o, bucket, vane = build_well()
trough = build_trough()
attach(well, 'attach_crank', (0.82, 0, 1.55))
attach(well, 'attach_rope', (0.0, -0.1, 1.55))
attach(well, 'attach_vane', (0.0, 0.0, 2.64))
objs = [well, crank, rope_o, bucket, vane, trough]
fit_all(objs, {'well': 2900, 'trough': 400, 'well_bucket': 260})  # design-v11 §16.3: well + 4 troughs 4-5k
report(objs)
save_blend('well')
to_origin(objs)
export_glb(objs, f'{GLB_DIR}/well.glb')
# preview: assembled
crank.location = (0.82, 0, 1.55)
rope_o.location = (0.0, -0.1, 1.55)
rope_o.scale.z = 0.55
bucket.location = (0.0, -0.1, 1.55 - 0.55)
vane.location = (0, 0, 2.64)
vane.rotation_euler.z = 0.5
ex = []
for (x, y, rz) in ((0, 1.95, 0), (0, -1.95, 0), (1.95, 0, math.pi / 2), (-1.95, 0, math.pi / 2)):
    ex.append(dup(trough, (x, y, 0), rz))
trough.location = (0, 0, -60)
preview([well, crank, rope_o, bucket, vane] + ex, f'{PNG_DIR}/well.png', yaw=-32, pitch=24, margin=0.68)
for e in ex:
    bpy.data.objects.remove(e, do_unlink=True)
trough.location = (3.4, 0, 0)
rope_o.scale.z = 1.0
save_blend('well')
print('FINAL well', {o.name: tris(o) for o in objs})
