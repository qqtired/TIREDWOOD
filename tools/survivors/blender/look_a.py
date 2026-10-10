# look_a.py — крупный план пропов из своего .blend в фоне (только чтение .blend, ничего не сохраняет).
# bg.sh tools/survivors/blender/look_a.py <file.blend> <out.png> <el_deg> <az_deg> <имя1,имя2,...>
import bpy, sys, math
argv = sys.argv[sys.argv.index('--') + 1:]
blend, out, el, az, names = argv[0], argv[1], float(argv[2]), float(argv[3]), argv[4].split(',')
bpy.ops.wm.open_mainfile(filepath=blend)
exec(open('/Users/tired/Desktop/game-opus-survivors/tools/survivors/blender/envkit_a.py').read())
from mathutils import Vector
obs = [bpy.data.objects[n] for n in names]
keep = set()
for o in obs:
    keep.add(o.name)
    for c in o.children_recursive:
        keep.add(c.name)
for o in bpy.data.objects:
    if o.type == 'MESH' and o.name not in keep and not o.name.startswith('preview'):
        o.hide_render = True
lo = Vector((1e9, 1e9, 1e9))
hi = -lo
for o in obs:
    a, b = obj_bbox(o)
    lo = Vector(map(min, lo, a))
    hi = Vector(map(max, hi, b))
lo.z = max(lo.z, 0.0)
cam = bpy.data.objects.get('preview_cam') or camera_at('preview_cam', get_coll('preview_rig'), (0, 0, 0), el, 10)
fit_dist(cam, lo, hi, el, az, (1200, 800), pad=1.1)
render_to(out, (1200, 800), samples=16)
