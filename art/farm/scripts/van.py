# Van-shop «Фургон»: van_open (awning, counter, crates) and van_closed; van_wheel (4 instances, attach points in extras);
# van_away_sign — chalkboard «домик» shown on the stand while the van is away. Nose = game -Z, hatch on the west (-X).
exec(open(LIB + '/props_common.py').read(), globals())
exec(open(LIB + '/crops.py').read(), globals())
exec(open(LIB + '/van.py').read(), globals())
reset()
vo = build_van(True)
vc = build_van(False)
wheel = build_wheel()
sign = build_away_sign()
for v in (vo, vc):
    for i, (x, y) in enumerate(WHEELS):
        attach(v, f'attach_wheel{i}', (x, y, WR))
objs = [vo, vc, wheel, sign]
fit_all(objs, {'van_open': 3900, 'van_closed': 3400, 'van_wheel': 280, 'van_away_sign': 420})  # v11: 4-5k with wheels
report(objs)
save_blend('van')
to_origin(objs)
export_glb(objs, f'{GLB_DIR}/van.glb')
# preview: open van with wheels, closed van behind, away sign
ex = []
vc.location = (2.6, -3.4, 0)
for v in (vo, vc):
    for (x, y) in WHEELS:
        ex.append(dup(wheel, (v.location.x + x, v.location.y + y, WR)))
sign.location = (-1.9, 2.9, 0)
wheel.location = (0, 0, -60)
preview([vo, vc, sign] + ex, f'{PNG_DIR}/van.png', yaw=-128, pitch=14, margin=0.64)
for e in ex:
    bpy.data.objects.remove(e, do_unlink=True)
wheel.location = (5.5, 0, WR)
save_blend('van')
print('FINAL van', {o.name: tris(o) for o in objs})
