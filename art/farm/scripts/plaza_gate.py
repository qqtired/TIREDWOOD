# Plaza entrance: wicket 1.4 m in the parapet (two leaves), 3 m posts with an arch board (blank, «ФЕРМА» in game),
# plus the signpost and plaza_cart (hay, pumpkins, sunflowers; plazaGate.local.cart x 0.3, z -3.4, 0.6 m lower,
# length along local X -> rotate 90 deg). Front (text) faces +Z of plazaGate.local = the plaza = Blender -Y.
# design-v11 §16.3: the whole set <= 2000 tris, one merge.
exec(open(LIB + '/props_common.py').read(), globals())
exec(open(LIB + '/crops.py').read(), globals())
exec(open(LIB + '/props.py').read(), globals())
exec(open(LIB + '/carts.py').read(), globals())
reset()
gate, left, right = build_plaza_gate()
sign = build_signpost()
cart = build_cart('plaza')
attach(gate, 'attach_leaf_l', (-0.7, 0, 0))
attach(gate, 'attach_leaf_r', (0.7, 0, 0))
objs = [gate, left, right, sign, cart]
fit_all(objs, {'plaza_gate': 950, 'plaza_gate_leaf_l': 160, 'plaza_gate_leaf_r': 160, 'signpost': 260, 'plaza_cart': 470})  # v11: set with cart <= 2k
report(objs)
save_blend('plaza_gate')
to_origin(objs)
export_glb(objs, f'{GLB_DIR}/plaza_gate.glb')
left.location = (-0.7, 0, 0)
right.location = (0.7, 0, 0)
right.rotation_euler.z = -0.6
sign.location = (-1.6, -0.9, 0)
cart.location = (0.3, 3.4, -0.6)
cart.rotation_euler.z = math.pi / 2
preview(objs, f'{PNG_DIR}/plaza_gate.png', yaw=-30, pitch=14, margin=0.85, look_z=1.2)
save_blend('plaza_gate')
print('FINAL plaza_gate', {o.name: tris(o) for o in objs})
