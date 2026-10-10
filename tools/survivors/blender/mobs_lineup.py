# mobs_lineup — общий кадр: все 8 мобов в одном масштабе рядом с фигуркой человека 1,5 м.
# Берёт модели из docs/survivors/blender/<id>.blend (поза покоя), рендер в docs/survivors/models/previews/lineup.png.
exec(open('/Users/tired/Desktop/game-opus-survivors/tools/survivors/blender/mobkit.py').read())

clean_scene()
ORDER = ['rat', 'bat', 'spitter', 'slug', 'shroom', 'beetle', 'HUMAN', 'shaman', 'cooper']


def append_model(mid):
    path = ROOT + '/docs/survivors/blender/%s.blend' % mid
    with bpy.data.libraries.load(path, link=False) as (src, dst):
        dst.collections = [c for c in src.collections if c == 'model_' + mid]
    coll = dst.collections[0]
    bpy.context.scene.collection.children.link(coll)
    root = next(o for o in coll.objects if o.name.startswith(mid) and o.type == 'EMPTY')
    for o in coll.objects:
        if o.animation_data:
            for t in o.animation_data.nla_tracks:
                t.mute = True
        if 'rest' in o:
            o.location = Vector(o['rest'])
            o.rotation_euler = (0, 0, 0)
            o.scale = (1, 1, 1)
    return root, [o for o in coll.objects if o.type == 'MESH']


def human():
    p = Part('human_1_5m', (0, 0, 0))
    for sx in (-1, 1):
        p.tube('cream', [(sx * 0.09, 0, 0.04), (sx * 0.09, 0, 0.45), (sx * 0.1, 0, 0.78)], [0.065, 0.07, 0.085], seg=10,
               caps=('round', 'round'))
        p.tube('cream', [(sx * 0.22, 0, 1.22), (sx * 0.26, 0, 0.95), (sx * 0.27, -0.02, 0.72)], [0.05, 0.045, 0.04],
               seg=8, caps=('round', 'round'))
    p.tube('cream', [(0, 0, 0.78), (0, 0, 1.0), (0, 0, 1.24)], [(0.17, 0.11), (0.16, 0.1), (0.2, 0.11)], seg=12,
           caps=('round', 'round'), cap_k=0.5)
    p.ellipsoid('cream', (0, 0, 1.385), (0.085, 0.095, 0.115), seg=12, rings=8)
    me = bpy.data.meshes.new('human_1_5m')
    p.bm.to_mesh(me)
    p.bm.free()
    m = bpy.data.materials.new('preview_human')
    try:
        m.use_nodes = True
    except Exception:
        pass
    b = next(n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    b.inputs['Base Color'].default_value = hexc('#8f949c')
    b.inputs['Roughness'].default_value = 0.7
    me.materials.append(m)
    ob = bpy.data.objects.new('human_1_5m', me)
    bpy.context.scene.collection.objects.link(ob)
    return ob, [ob]


items = []
for mid in ORDER:
    if mid == 'HUMAN':
        root, meshes = human()
    else:
        root, meshes = append_model(mid)
    bpy.context.view_layer.update()
    lo, hi = world_bbox({o.name: o for o in meshes})
    items.append((mid, root, lo, hi))

x = 0.0
GAP = 0.45
for mid, root, lo, hi in items:
    w = hi.x - lo.x
    root.location.x = x - lo.x
    root.location.y = -0.5 * (lo.y + hi.y)
    x += w + GAP
bpy.context.view_layer.update()
total = x - GAP

cam = preview_rig('lineup')
sc = bpy.context.scene
sc.camera = cam
cam.data.type = 'ORTHO'
cam.data.ortho_scale = total * 1.04
az, el = math.radians(14), math.radians(22)
d = Vector((math.cos(el) * math.sin(az), -math.cos(el) * math.cos(az), math.sin(el)))
c = Vector((total / 2, 0, 1.15))
cam.location = c + d * 30
cam.rotation_euler = (c - cam.location).to_track_quat('-Z', 'Y').to_euler()
cam.data.clip_end = 200
sun = bpy.data.objects['preview_sun']
sun.rotation_euler = (math.radians(50), math.radians(-12), math.radians(-30))
bpy.data.objects['preview_torch'].location = (total * 0.3, -4, 3.5)
bpy.data.objects['preview_torch'].data.energy = 500
render_to(ROOT + '/docs/survivors/models/previews/lineup.png', (2200, 700))
print('lineup width', round(total, 2), [(m, round(h.x - l.x, 2), round(h.z - max(l.z, 0) if m != 'bat' else h.z, 2)) for m, r, l, h in items])
