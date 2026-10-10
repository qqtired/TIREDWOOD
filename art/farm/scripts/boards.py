# Order board (2 m) and farm notice board (2.4 m). Both face game -Z (Blender +Y) so rotation.y = layout yaw works.
exec(open(LIB + '/props_common.py').read(), globals())
exec(open(LIB + '/crops.py').read(), globals())
exec(open(LIB + '/props.py').read(), globals())
for mid, fn in (('order_board', build_order_board), ('notice_board', build_notice_board)):
    reset()
    ob = fn()
    fit_tris(ob, {'order_board': 1800, 'notice_board': 2000}[mid])  # design-v11 §16.3: 1-2k each
    report([ob])
    save_blend(mid)
    export_glb([ob], f'{GLB_DIR}/{mid}.glb')
    preview([ob], f'{PNG_DIR}/{mid}.png', yaw=180 - 28, pitch=12, margin=0.62)
    save_blend(mid)
    print('FINAL', mid, tris(ob))
