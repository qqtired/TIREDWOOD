# Hand tools, design-v11 §16.7: rake_1..3 (wooden / iron teeth / brass-bound lacquered), can_1..3 + can_gold
# (green tin / bigger copper / big teal with brass spout and pattern / gold skin), shovel_1..3 + shovel_gold
# (wooden / steel / forged with carved handle / gold), bucket (well), bag_1..4 (seed bag).
# Origin = grip (rake/can/shovel/bucket) or shoulder strap top (bag). Tool forward = +Y (game -Z), up = +Z.
exec(open(LIB + '/props_common.py').read(), globals())
exec(open(LIB + '/crops.py').read(), globals())
exec(open(LIB + '/extras.py').read(), globals())
reset()
rakes = [build_rake(t) for t in (1, 2, 3)]
cans = [build_can(t) for t in (1, 2, 3, 'gold')]
shovels = [build_shovel(t) for t in (1, 2, 3, 'gold')]
bags = [build_bag(t) for t in (1, 2, 3, 4)]
bucket = build_bucket()
objs = rakes + cans + shovels + bags + [bucket]
fit_all(objs, {'can_3': 800})
report(objs)
save_blend('tools')
to_origin(objs)
export_glb(objs, f'{GLB_DIR}/tools.glb')
# preview layout: rakes standing at the back, then cans + bucket, shovels, bags in front
rows = [(rakes, 1.12, 0.5), (cans + [bucket], 0.36, 0.42), (shovels, 0.04, 0.4), (bags, 0.72, 0.45)]
for r, (row, lift, step) in enumerate(rows):
    for i, o in enumerate(row):
        o.location = ((i - (len(row) - 1) / 2) * step, 0.9 - r * 0.55, lift)
        if r == 2:
            o.rotation_euler = (0, 0, -0.6)
preview(objs, f'{PNG_DIR}/tools.png', yaw=-18, pitch=24, margin=0.78, look_z=0.45)
save_blend('tools')
print('FINAL tools', {o.name: tris(o) for o in objs})
