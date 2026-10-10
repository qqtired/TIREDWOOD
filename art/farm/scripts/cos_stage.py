# TIREDWOOD, фермерская косметика: прокси-желейка (точная копия тела из client/render/avatar.ts + outfit3d.ts),
# сцена превью и общий прогон «собрать -> сохранить .blend -> .glb -> превью».
# Запуск: Blender -b --factory-startup --python art/farm/scripts/cos_<slot>.py -- <name> [<name> ...]
import bpy, math, os, sys
from mathutils import Vector

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from cos_lib import *  # noqa

BLEND_DIR = ROOT + '/art/farm/blend'
GLB_DIR = ROOT + '/client/assets/farm/models'
TEX_DIR = ROOT + '/client/assets/farm/textures'
PNG_DIR = ROOT + '/art/farm/renders'
TMP = os.environ.get('COS_TMP', '/tmp/cos-farm')
os.makedirs(TMP, exist_ok=True)

JELLY = 0xb39ddb  # лавандовый — обычный цвет желейки из PALETTE (shared/outfit.ts, индекс 11)
EYES_Y, EYES_Z = 1.17, -0.4
SKY, GROUND = 0xb9c6dc, 0x93a86a


def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def new_mat(name):
    m = bpy.data.materials.new(name)
    try:
        m.use_nodes = True
    except Exception:
        pass
    return m


def principled(m):
    return next(n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')


def simple_mat(name, hexv, rough=0.5, emis=None, alpha=1.0):
    m = new_mat(name)
    b = principled(m)
    b.inputs['Base Color'].default_value = lin(hexv)
    b.inputs['Roughness'].default_value = rough
    if emis is not None:
        b.inputs['Emission Color'].default_value = lin(emis)
        b.inputs['Emission Strength'].default_value = 1.0
    if alpha < 1:
        b.inputs['Alpha'].default_value = alpha
        try:
            m.surface_render_method = 'BLENDED'
        except Exception:
            pass
    return m


def mesh_obj(name, g, mat, coll, smooth=True, sharp_deg=50):
    me = bpy.data.meshes.new(name)
    me.from_pydata([(p.x, -p.z, p.y) for p in g.v], [], g.f)
    me.update()
    me.materials.append(mat)
    me.polygons.foreach_set('use_smooth', [smooth] * len(me.polygons))
    try:
        me.set_sharp_from_angle(angle=math.radians(sharp_deg))
    except Exception:
        pass
    ob = bpy.data.objects.new(name, me)
    coll.objects.link(ob)
    return ob


def layer_coords(nt):
    """Развёртка слоя ткани: u = phi / 2pi (phi = atan2(x, z) в осях игры, 0 — спина, 0.5 — лицо), v = y / 1.58."""
    tc = nt.nodes.new('ShaderNodeTexCoord')
    sep = nt.nodes.new('ShaderNodeSeparateXYZ')
    nt.links.new(tc.outputs['Object'], sep.inputs[0])
    negy = nt.nodes.new('ShaderNodeMath'); negy.operation = 'MULTIPLY'; negy.inputs[1].default_value = -1
    nt.links.new(sep.outputs['Y'], negy.inputs[0])
    at = nt.nodes.new('ShaderNodeMath'); at.operation = 'ARCTAN2'
    nt.links.new(sep.outputs['X'], at.inputs[0])
    nt.links.new(negy.outputs[0], at.inputs[1])
    u = nt.nodes.new('ShaderNodeMath'); u.operation = 'MULTIPLY'; u.inputs[1].default_value = 1 / TAU
    nt.links.new(at.outputs[0], u.inputs[0])
    uf = nt.nodes.new('ShaderNodeMath'); uf.operation = 'FRACT'
    nt.links.new(u.outputs[0], uf.inputs[0])
    v = nt.nodes.new('ShaderNodeMath'); v.operation = 'MULTIPLY'; v.inputs[1].default_value = 1 / H
    nt.links.new(sep.outputs['Z'], v.inputs[0])
    cmb = nt.nodes.new('ShaderNodeCombineXYZ')
    nt.links.new(uf.outputs[0], cmb.inputs[0])
    nt.links.new(v.outputs[0], cmb.inputs[1])
    return cmb.outputs[0]


def jelly_material(hexv=JELLY, layers=()):
    """Желе: лак (clearcoat 1 / 0.08), шероховатость 0.32, свечение 0.16 цвета, кайма (rim) цвета тела + 55 % белого.
    layers — слои ткани [(png, roughness, glow_png|None)], снизу вверх: смешиваются поверх желе по альфе."""
    m = new_mat('jelly')
    nt = m.node_tree
    b = principled(m)
    c = lin(hexv)
    b.inputs['Base Color'].default_value = c
    b.inputs['Roughness'].default_value = 0.32
    b.inputs['Coat Weight'].default_value = 1.0
    b.inputs['Coat Roughness'].default_value = 0.08
    b.inputs['Emission Color'].default_value = c
    b.inputs['Emission Strength'].default_value = 0.16
    out = next(n for n in nt.nodes if n.type == 'OUTPUT_MATERIAL')
    shader = b.outputs[0]
    if layers:
        uv = layer_coords(nt)
        for (png, rough, glow) in layers:
            img = bpy.data.images.load(png, check_existing=True)
            tex = nt.nodes.new('ShaderNodeTexImage'); tex.image = img
            tex.extension = 'REPEAT'; tex.interpolation = 'Closest'  # без мип-уровней: нет шва на спине
            nt.links.new(uv, tex.inputs[0])
            cl = nt.nodes.new('ShaderNodeBsdfPrincipled')
            nt.links.new(tex.outputs['Color'], cl.inputs['Base Color'])
            cl.inputs['Roughness'].default_value = rough
            if rough < 0.4:
                cl.inputs['Coat Weight'].default_value = 0.6
                cl.inputs['Coat Roughness'].default_value = 0.12
            if glow:
                gi = bpy.data.images.load(glow, check_existing=True)
                gt = nt.nodes.new('ShaderNodeTexImage'); gt.image = gi
                gt.extension = 'REPEAT'; gt.interpolation = 'Closest'
                try:
                    gi.colorspace_settings.name = 'Non-Color'
                except Exception:
                    pass
                nt.links.new(uv, gt.inputs[0])
                cl.inputs['Emission Color'].default_value = lin(0xffc35a)
                nt.links.new(gt.outputs['Color'], cl.inputs['Emission Strength'])
            mix = nt.nodes.new('ShaderNodeMixShader')
            nt.links.new(tex.outputs['Alpha'], mix.inputs[0])
            nt.links.new(shader, mix.inputs[1])
            nt.links.new(cl.outputs[0], mix.inputs[2])
            shader = mix.outputs[0]
    # кайма: pow(1 - |N.V|, 2.4) * 0.6 * (цвет тела -> белый на 55 %)
    lw = nt.nodes.new('ShaderNodeLayerWeight'); lw.inputs['Blend'].default_value = 0.5
    pw = nt.nodes.new('ShaderNodeMath'); pw.operation = 'POWER'; pw.inputs[1].default_value = 2.4
    nt.links.new(lw.outputs['Facing'], pw.inputs[0])
    rim = [c[i] + (1 - c[i]) * 0.55 for i in range(3)]
    em = nt.nodes.new('ShaderNodeEmission')
    em.inputs['Color'].default_value = (rim[0], rim[1], rim[2], 1)
    k = nt.nodes.new('ShaderNodeMath'); k.operation = 'MULTIPLY'; k.inputs[1].default_value = 0.6
    nt.links.new(pw.outputs[0], k.inputs[0])
    nt.links.new(k.outputs[0], em.inputs['Strength'])
    add = nt.nodes.new('ShaderNodeAddShader')
    nt.links.new(shader, add.inputs[0])
    nt.links.new(em.outputs[0], add.inputs[1])
    nt.links.new(add.outputs[0], out.inputs['Surface'])
    return m


# варежки-ручки в превью (сфера 0.1 x 0.092 x 0.088 цвета тела, как в avatar.ts): по бокам, чуть вперёд
MITTEN_POSE = {'L': (-0.6, 0.6, -0.2), 'R': (0.6, 0.6, -0.2)}


def make_jelly(coll, hexv=JELLY, layers=(), mittens=False, pose=None):
    """Тело (LatheGeometry(bodyProfile(), 36)), глаза, рот и румянец (look v2), варежки по желанию."""
    objs = []
    jm = jelly_material(hexv, layers)
    pts = [(0.0, PTS[0][1])] + PTS[1:-1] + [(0.0, PTS[-1][1])]  # полюса без иголки на макушке
    body = lathe(pts, 36)
    objs.append(mesh_obj('jelly_body', body, jm, coll, sharp_deg=180))
    # глаза: белок 0.105 (1, 1.15, 0.55) в +-0.13; зрачок 0.052 (1, 1.2, 0.5) в +-0.125, +0.005, -0.045
    em = simple_mat('jelly_eye', 0xffffff, 0.25, emis=0x303030)
    pm = simple_mat('jelly_pupil', 0x111318, 0.15)
    for s in (-1, 1):
        objs.append(mesh_obj('jelly_eye_%s' % ('L' if s < 0 else 'R'),
                             sphere(0.105, 0.105 * 1.15, 0.105 * 0.55, 16, 12).move(s * 0.13, EYES_Y, EYES_Z), em, coll))
        objs.append(mesh_obj('jelly_pupil_%s' % ('L' if s < 0 else 'R'),
                             sphere(0.052, 0.052 * 1.2, 0.026, 12, 10).move(s * 0.125, EYES_Y + 0.005, EYES_Z - 0.045), pm, coll))
    # рот-улыбка: квадратичная дуга 64 мм на высоте ~0.98 (lookface.ts), над телом на 12 мм
    mm = simple_mat('jelly_mouth', 0x3a1418, 0.55)
    pts = []
    for i in range(9):
        t = i / 8
        s = (t - 0.5) * 0.064
        y = 0.983 - 0.013 * 4 * t * (1 - t) / 2
        r = bodyR(y) + 0.012
        a = s / r
        pts.append((r * math.sin(a), y, -r * math.cos(a)))
    objs.append(mesh_obj('jelly_mouth', tube(pts, 0.005, 12, 6), mm, coll))
    bm = simple_mat('jelly_blush', 0xff6987, 0.6, alpha=0.4)
    for s in (-1, 1):
        g = patch(PI + s * 0.2 / bodyR(1.012), 1.012, 0.1, 0.06, 0.008, 0.001, 0, 8, 4,
                  shape=lambda a, b: (0.5 + (a - 0.5) * math.sqrt(max(0, 1 - (2 * b - 1) ** 2)), b))
        objs.append(mesh_obj('jelly_blush_%s' % ('L' if s < 0 else 'R'), g, bm, coll))
    if mittens:
        sk = simple_mat('jelly_mitten', hexv, 0.32)
        for side, p in (pose or MITTEN_POSE).items():
            o = mesh_obj('jelly_mitten_' + side, sphere(0.1, 0.092, 0.088, 14, 10).move(*p), sk, coll)
            objs.append(o)
    return objs


def setup_scene():
    sc = bpy.context.scene
    for eng in ('BLENDER_EEVEE', 'BLENDER_EEVEE_NEXT'):
        try:
            sc.render.engine = eng
            break
        except TypeError:
            pass
    try:
        sc.eevee.taa_render_samples = 48
    except Exception:
        pass
    sc.render.resolution_x = 256
    sc.render.resolution_y = 512
    sc.render.resolution_percentage = 100
    sc.render.film_transparent = False
    for vt in ('ACES 1.3', 'ACES 2.0', 'AgX'):
        try:
            sc.view_settings.view_transform = vt
            break
        except Exception:
            pass
    w = bpy.data.worlds.new('cos_world')
    sc.world = w
    try:
        w.use_nodes = True
    except Exception:
        pass
    bg = next(n for n in w.node_tree.nodes if n.type == 'BACKGROUND')
    bg.inputs[0].default_value = lin(SKY)
    bg.inputs[1].default_value = 1.0
    ld = bpy.data.lights.new('cos_sun', 'SUN')
    ld.energy = 4.2
    ld.color = (1.0, 0.86, 0.7)
    ld.angle = math.radians(8)
    so = bpy.data.objects.new('cos_sun', ld)
    sc.collection.objects.link(so)
    d = Vector((-0.45, -0.8, -1.0)).normalized()  # свет идёт сверху, спереди-слева (лицо смотрит в +Y)
    so.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler()
    gm = simple_mat('cos_ground', GROUND, 0.9)
    g = lathe([(0, 0), (6, 0)], 48, flip=True)
    go = mesh_obj('cos_ground', g, gm, sc.collection)
    go.location.z = -0.006
    cd = bpy.data.cameras.new('cos_cam')
    cd.lens = 70
    co = bpy.data.objects.new('cos_cam', cd)
    sc.collection.objects.link(co)
    sc.camera = co


def bbox(objs):
    lo = Vector((1e9, 1e9, 1e9))
    hi = -lo
    for o in objs:
        for c in o.bound_box:
            w = o.matrix_world @ Vector(c)
            lo = Vector(map(min, lo, w))
            hi = Vector(map(max, hi, w))
    return lo, hi


def shoot(objs, view, path):
    """view: направление от цели к камере (в осях Blender)."""
    sc = bpy.context.scene
    cam = sc.camera
    lo, hi = bbox(objs)
    c = (lo + hi) / 2
    size = hi - lo
    d = Vector(view).normalized()
    fov_v = 2 * math.atan(18 / cam.data.lens)
    fov_h = 2 * math.atan(9 / cam.data.lens)
    rad_h = max(size.x, size.y) / 2 * 1.12
    rad_v = size.z / 2 * 1.1 + 0.06
    dist = max(rad_h / math.tan(fov_h / 2), rad_v / math.tan(fov_v / 2)) + max(size.x, size.y) / 2
    cam.location = c + d * dist
    cam.rotation_euler = (-d).to_track_quat('-Z', 'Y').to_euler()
    sc.render.filepath = path
    sc.render.image_settings.file_format = 'PNG'
    bpy.ops.render.render(write_still=True)


def stitch(a, b, out):
    import numpy as np
    ia = bpy.data.images.load(a)
    ib = bpy.data.images.load(b)
    pa = np.empty(256 * 512 * 4, dtype=np.float32)
    pb = np.empty(256 * 512 * 4, dtype=np.float32)
    ia.pixels.foreach_get(pa)
    ib.pixels.foreach_get(pb)
    c = np.concatenate([pa.reshape(512, 256, 4), pb.reshape(512, 256, 4)], axis=1)
    img = bpy.data.images.new('cos_preview', 512, 512)
    img.pixels.foreach_set(c.ravel())
    img.filepath_raw = out
    img.file_format = 'PNG'
    img.save()
    bpy.data.images.remove(ia)
    bpy.data.images.remove(ib)
    bpy.data.images.remove(img)


FRONT = (0.62, 1.0, 0.36)
BACK = (-0.62, -1.0, 0.36)


def preview(objs, out, views=(FRONT, BACK)):
    a = TMP + '/_a.png'
    b = TMP + '/_b.png'
    shoot(objs, views[0], a)
    shoot(objs, views[1], b)
    os.makedirs(os.path.dirname(out), exist_ok=True)
    stitch(a, b, out)


def save_blend(path, scripts=()):
    for s in scripts:
        t = bpy.data.texts.new(os.path.basename(s))
        t.write(open(s).read())
    try:
        bpy.context.preferences.filepaths.save_version = 0
    except Exception:
        pass
    bpy.ops.wm.save_as_mainfile(filepath=path, compress=True)


def make_proxy():
    reset()
    setup_scene()
    coll = item_collection('jelly_proxy')
    objs = make_jelly(coll, mittens=True)
    here = os.path.dirname(os.path.abspath(__file__))
    save_blend(BLEND_DIR + '/jelly_proxy.blend', [here + '/cos_lib.py', here + '/cos_stage.py'])
    print('PROXY saved, body tris', tri_count([o for o in objs if o.name == 'jelly_body']))


def run(slot, table, names, script):
    """Каждую вещь: чистая сцена + прокси, сборка, .blend, .glb, превью. table[name]() -> dict."""
    here = os.path.dirname(os.path.abspath(__file__))
    report = []
    for name in names:
        reset()
        setup_scene()
        spec = table[name]()
        jc = item_collection('jelly_proxy')
        jelly = make_jelly(jc, spec.get('jelly', JELLY), spec.get('layers', ()), spec.get('mittens', True), spec.get('pose'))
        ic = item_collection('cos_%s_%s' % (slot, name))
        objs = []
        for (oname, part, anchor) in spec['objects']:
            if part is None or not part.f:
                continue
            objs.append(build(oname, part, anchor, ic))
        for (oname, part, frame, pname) in spec.get('locals', []):
            parent = bpy.data.objects[pname]
            objs.append(build_local(oname, part, frame, ic, parent))
        tris = tri_count(objs)
        # зазор до тела: радиус вершины минус радиус тела на той же высоте (для того, что надето на тело)
        clear = 9.0
        where = None
        if not spec.get('on_mitten'):
            for (oname, part, anchor) in spec['objects']:
                if '_cuff_' in oname:
                    continue
                for p in (part.v if part else []):
                    if 0.02 < p.y < H - 0.01:
                        cv = math.hypot(p.x, p.z) - bodyR(p.y)
                        if cv < clear:
                            clear, where = cv, (round(p.x, 3), round(p.y, 3), round(p.z, 3), oname)
        base = 'cos_%s_%s' % (slot, name)
        size = 0
        if objs:
            size = export_glb(objs, '%s/%s.glb' % (GLB_DIR, base))
        save_blend('%s/%s.blend' % (BLEND_DIR, base), [here + '/cos_lib.py', here + '/cos_stage.py', script])
        view_objs = [o for o in jelly if 'body' in o.name] + objs + spec.get('frame_extra', [])
        preview(view_objs, '%s/%s.png' % (PNG_DIR, base), spec.get('views', (FRONT, BACK)))
        line = '%s tris=%d glb=%dB clear=%.3f anchor=%s' % (base, tris, size, clear, tuple(round(c, 4) for c in spec['objects'][0][2]) if spec['objects'] else '-')
        print('ITEM', line, 'at' if clear < 0.004 else '', where if clear < 0.004 else '')
        report.append(line)
    sheet(['%s/cos_%s_%s.png' % (PNG_DIR, slot, n) for n in names], TMP + '/sheet_%s.png' % slot)
    print('DONE', len(report))
    return report


def sheet(paths, out, cols=3):
    """Контактный лист превью (по 384 px на вещь) — для быстрой проверки."""
    import numpy as np
    cell = 384
    rows = (len(paths) + cols - 1) // cols
    W, Hh = cols * cell, rows * cell
    big = np.ones((Hh, W, 4), dtype=np.float32)
    for k, p in enumerate(paths):
        im = bpy.data.images.load(p)
        a = np.empty(512 * 512 * 4, dtype=np.float32)
        im.pixels.foreach_get(a)
        a = a.reshape(512, 512, 4)
        idx = (np.arange(cell) * 512 / cell).astype(int)
        a = a[idx][:, idx]
        r, c = k // cols, k % cols
        y0 = Hh - (r + 1) * cell
        big[y0:y0 + cell, c * cell:(c + 1) * cell] = a
        bpy.data.images.remove(im)
    img = bpy.data.images.new('cos_sheet', W, Hh)
    img.pixels.foreach_set(big.ravel())
    img.filepath_raw = out
    img.file_format = 'PNG'
    img.save()


def cli_names(table):
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    return argv or list(table.keys())
