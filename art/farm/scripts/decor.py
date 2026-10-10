# Location decor (design-v11 §16.3 «Фонари, гирлянда», «Декор»): lantern_post (2.8 m), garland (6 m, origin left end,
# spans +X), garland_pole, haystack, telescope, bench, fence_segment / railing_segment (2.4 m modules along +X),
# gate_big (west gate to town and the van gate). All origins at the base; fronts face -Y unless noted.
exec(open(LIB + '/props_common.py').read(), globals())
exec(open(LIB + '/crops.py').read(), globals())
exec(open(LIB + '/carts.py').read(), globals())
exec(open(LIB + '/decor.py').read(), globals())
reset()
objs = [build_lantern_post(), build_garland(), build_garland_pole(), build_haystack(), build_telescope(), build_bench(),
        build_fence_segment(), build_railing_segment(), build_gate_big()]
attach(objs[0], 'attach_light', (0.5, 0.0, 2.18))
fit_all(objs, {'lantern_post': 500, 'garland_pole': 120, 'bench': 500, 'railing_segment': 160, 'gate_big': 900})
report(objs)
save_blend('decor')
to_origin(objs)
export_glb(objs, f'{GLB_DIR}/decor.glb')
# preview: back row gate + fence + railing, front row lantern, haystack, telescope, bench; garland between two poles
lp, ga, gp, hs, ts, bn, fs_, rs, gb = objs
for o, p in ((gb, (0, 3.0, 0)), (fs_, (-4.6, 3.0, 0)), (rs, (2.2, 3.0, 0)), (lp, (-3.0, 0.0, 0)), (hs, (-1.0, 0.3, 0)),
             (ts, (1.0, -0.4, 0)), (bn, (2.6, -0.2, 0)), (gp, (-2.4, 1.5, 0)), (ga, (-2.4, 1.5, 3.1))):
    o.location = p
ex = [dup(gp, (3.6, 1.5, 0))]
ga.scale.x = 1.0
preview(objs + ex, f'{PNG_DIR}/decor.png', yaw=-20, pitch=16, margin=0.62, look_z=1.2)
for e in ex:
    bpy.data.objects.remove(e, do_unlink=True)
save_blend('decor')
print('FINAL decor', {o.name: tris(o) for o in objs})
