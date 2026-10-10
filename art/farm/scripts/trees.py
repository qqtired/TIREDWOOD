# Trees and plants for the farm (level.md trees / nooks; InstancedMesh per kind): tree_apple (~4 m), tree_cypress (~6 m),
# tree_linden (~6.5 m), bush (~1 m), sunflower_decor (~1.9 m). Origin at the trunk foot.
exec(open(LIB + '/props_common.py').read(), globals())
exec(open(LIB + '/crops.py').read(), globals())
exec(open(LIB + '/carts.py').read(), globals())
exec(open(LIB + '/decor.py').read(), globals())
reset()
objs = [build_tree_apple(), build_tree_cypress(), build_tree_linden(), build_bush(), build_sunflower_decor()]
fit_all(objs, {'tree_apple': 1500, 'tree_linden': 1500, 'tree_cypress': 800, 'bush': 450, 'sunflower_decor': 330})
report(objs)
finalize('trees', objs, yaw=-25, pitch=12, margin=0.78, gap=0.8, look_z=2.4)
