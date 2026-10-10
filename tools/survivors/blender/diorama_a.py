# diorama_a — три диорамы ~24×24 м (погреба, грибная пещера, кристальный грот) из пропов kit_*.blend
# с врагами и героем для масштаба (их GLB только импортируются, файлы не меняются).
# Запуск в фоне: tools/survivors/blender/bg.sh tools/survivors/blender/diorama_a.py [cellars|mushrooms|grotto ...]
# Сохраняет docs/survivors/blender/diorama_a.blend (три коллекции, каждая со своей камерой и светом),
# рендерит docs/survivors/models/previews/diorama_<зона>.png (1600×900, камера игры: 62°, FOV 36°, 31 м).
import sys
exec(open('/Users/tired/Desktop/game-opus-survivors/tools/survivors/blender/envkit_a.py').read())

ARGS = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
ZONES = [z for z in ARGS if z in ('cellars', 'mushrooms', 'grotto')] or ['cellars', 'mushrooms', 'grotto']
NO_RENDER = 'norender' in ARGS
MODELS = ROOT + '/docs/survivors/models/'
BL = ROOT + '/docs/survivors/blender/'

clean_scene()
SC = bpy.context.scene
LF = 0.5   # общий множитель ламп диорамы
SRC = {}   # имя пропа -> объект-источник (вне сцены)


def load_kit(kit):
    with bpy.data.libraries.load(BL + kit + '.blend', link=False) as (src, dst):
        dst.objects = [n for n in src.objects if not n.startswith('preview')]
    for ob in dst.objects:
        if ob is not None and ob.type == 'MESH':
            SRC[ob.name] = ob


for k in ('kit_common', 'kit_cellars', 'kit_mushrooms', 'kit_grotto'):
    load_kit(k)


def dup(ob, coll, parent=None):
    c = ob.copy()
    coll.objects.link(c)
    if parent is not None:
        c.parent = parent
        c.matrix_parent_inverse = ob.matrix_parent_inverse.copy()
    for ch in ob.children:
        dup(ch, coll, c)
    return c


def place(coll, name, x, y, rz=0.0, s=1.0, z=0.0):
    src = SRC[name]
    ob = dup(src, coll)
    ob.location = (x, y, z)
    ob.rotation_euler = (0, 0, rz)
    ob.scale = (s, s, s)
    return ob


GLB = {}


def import_glb(name, coll):
    """Импорт GLB героя/врага; возвращает корни. Файл не меняется."""
    p = MODELS + name + '.glb'
    if not os.path.exists(p):
        return []
    before = set(bpy.data.objects)
    acts = set(bpy.data.actions)
    bpy.ops.import_scene.gltf(filepath=p)
    global ACT0
    ACT0 = [a for a in bpy.data.actions if a not in acts]
    new = [o for o in bpy.data.objects if o not in before]
    keep = []
    for o in new:
        if any(c.name.startswith('glTF_not_exported') for c in o.users_collection):
            o.hide_render = True   # служебные формы костей импортёра
            o.hide_viewport = True
            continue
        for c in list(o.users_collection):
            c.objects.unlink(o)
        coll.objects.link(o)
        keep.append(o)
        ad = o.animation_data
        if ad:
            idle = next((a for a in bpy.data.actions if a.name.split('.')[0].endswith('idle') and a in ACT0), None)
            try:
                ad.action = idle
                if idle is not None and hasattr(ad, 'action_slot') and len(idle.slots):
                    ad.action_slot = idle.slots[0]
            except Exception:
                ad.action = None
            for tr in ad.nla_tracks:
                tr.mute = True
    return [o for o in keep if o.parent is None or o.parent not in keep]


def put_mob(coll, name, spots):
    """Первый экземпляр импортом, остальные — копиями иерархии."""
    roots = import_glb(name, coll)
    if not roots:
        return 0
    base = roots[0]
    out = [base]
    for i in range(1, len(spots)):
        out.append(dup(base, coll))
    for ob, (x, y, rz) in zip(out, spots):
        ob.location = (x, y, ob.location.z)
        ob.rotation_euler = (ob.rotation_euler.x, ob.rotation_euler.y, rz)
    return len(out)


def light(coll, x, y, z, w, hexs, r=0.4):
    return add_light('L_%s_%d' % (coll.name, len(coll.objects)), 'POINT', (x, y, z), w * LF, hexs, coll, size=r)


def lake(coll, x, y, r_deep, r_shallow):
    for nm, r, z, col, rough in (('water_shallow', r_shallow, 0.012, '#1e4b52', 0.15), ('water_deep', r_deep, 0.03, '#0b1d22', 0.05)):
        m = bpy.data.materials.new(nm + '_' + coll.name)
        b = next(n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
        b.inputs['Base Color'].default_value = hexc(col)
        b.inputs['Roughness'].default_value = rough
        g = disc(r, 'stone_dark', seg=48, z=z, rfn=lambda a, r=r: r * (1 + 0.06 * nang(a, 1.4, 3.0)))
        ob = make_obj(nm + '_' + coll.name, g, coll)
        ob.data.materials.clear()
        ob.data.materials.append(m)
        ob.location = (x, y, 0)


def zone_setup(zone, floor_hex):
    coll = get_coll('diorama_' + zone)
    floor_plane('floor_' + zone, (64, 50), floor_hex, coll, z=-0.004, noise_amt=0.22)
    return coll


def hero(coll, x, y, rz=0.0):
    roots = import_glb('hero', coll)
    for r in roots:
        r.location = (x, y, r.location.z)
        r.rotation_euler = (r.rotation_euler.x, r.rotation_euler.y, rz)
    # фонарь героя — единственная «настоящая» лампа игры
    light(coll, x + 0.5, y - 0.3, 1.3, 900, '#ffc27a', 0.15)
    return roots


def scatter(coll, names, n, seed, keep_out=()):
    """Мелкий декор россыпью по кадру, мимо заданных кругов (x, y, r)."""
    R = rng(seed)
    k = 0
    tries = 0
    while k < n and tries < 500:
        tries += 1
        x, y = R.uniform(-17, 17), R.uniform(-11, 11)
        if any((x - a) ** 2 + (y - b) ** 2 < r * r for a, b, r in keep_out):
            continue
        place(coll, names[k % len(names)], x, y, R.uniform(0, TAU), R.uniform(0.85, 1.15))
        k += 1


# ------------------------------------------------------------ погреба
def build_cellars():
    c = zone_setup('cellars', '#6e5644')
    # Световой колодец: мозаика «роза ветров», лестница на запад; решётка на 7 м в игре растворяется — здесь скрыта
    mx, my = -7.5, 3.5
    ws = place(c, 'well_stairs', mx, my)
    for ch in ws.children:
        if ch.name.startswith('well_stairs_grate'):
            ch.hide_render = True
    sp = add_light('L_well_shaft', 'SPOT', (mx, my, 14.0), 9000 * LF, '#fff0d6', c, size=1.5)
    sp.data.spot_size = math.radians(42)
    sp.data.spot_blend = 0.6
    for s in (-1, 1):
        light(c, mx - 5.35, my + s * 1.85, 1.5, 160, '#ffa04a', 0.2)   # фонари у лестницы
    # своды 2×2
    for (x, y) in [(3.5, -5.5), (10.5, -5.5), (3.5, 1.5), (10.5, 1.5)]:
        place(c, 'brick_pillar_a', x, y)
    place(c, 'brick_pillar_b', 17.5, -5.5, 0.0)
    # винная галерея
    place(c, 'wine_rack_a', 8.0, 10.6)
    place(c, 'wine_rack_b', 8.0, 5.6, math.pi)
    # бочка-великан — ориентир
    place(c, 'giant_barrel', 18.0, 8.5, 0.35)
    place(c, 'barrel_stack_a', -1.0, 10.8, 0.1)
    place(c, 'barrel_stack_b', -0.5, -8.6, 0.35)
    place(c, 'barrel', 1.5, -10.0, 0.4)
    place(c, 'barrel', 2.3, -9.2, 1.4, 0.95)
    place(c, 'crate_stack_a', -14.0, -8.5, 0.25)
    place(c, 'crate_stack_b', 15.5, -9.0, -0.4)
    place(c, 'rubble_a', -15.5, -3.0, 0.6)
    place(c, 'rock_mass_a', -21.0, -13.0, 0.4)
    place(c, 'rock_ridge_10', 22.0, -3.0, 1.45)
    scatter(c, ['floor_decal_kit_slabs', 'floor_decal_kit_crack', 'floor_decal_kit_pebbles', 'floor_decal_kit_slabs',
                'floor_decal_kit_gravel'], 20, 5, [(0, 0.6, 2.5), (mx, my, 5.4)])
    for nm, x, y, r in [('floor_decal_kit_bottle', 1.0, 6.5, 0.2), ('floor_decal_kit_shards', 6.5, -1.5, 2.0),
                        ('floor_decal_kit_jam_drops', 14.5, 3.5, 0.4), ('floor_decal_kit_chain', 5.0, -8.0, 0.8),
                        ('floor_decal_kit_jam_drops', 0.8, -6.6, 2.0), ('floor_decal_kit_bottle', 12.5, -2.0, 2.6),
                        ('floor_decal_kit_sleeper', -10.5, -6.0, 0.3)]:
        place(c, nm, x, y, r)
    # факелы: на колоннах (к камере) и на треногах
    for (x, y) in [(3.5, -5.5), (10.5, -5.5)]:
        place(c, 'torch_stand_wall', x, y - 0.53)
        light(c, x, y - 0.95, 2.1, 260, '#ffa04a', 0.2)
    for (x, y) in [(-1.5, 6.8), (14.0, 1.5), (-12.5, -6.0)]:
        place(c, 'torch_stand_floor', x, y)
        light(c, x, y, 2.0, 380, '#ffa04a', 0.2)
    light(c, 17.0, 3.0, 1.0, 150, '#b57bff', 0.5)   # варенье у крана
    # враги и герой
    put_mob(c, 'rat', [(6.0, -2.0, 2.0), (6.8, -2.8, 1.8), (7.4, -1.6, 2.2), (6.2, -3.6, 1.6), (-3.5, -6.5, -0.6),
                       (-2.8, -7.3, -0.4)])
    put_mob(c, 'slug', [(7.0, 3.6, 3.6), (-4.5, -4.0, 0.9)])
    put_mob(c, 'beetle', [(-12.0, 1.0, 1.4)])
    put_mob(c, 'spitter', [(13.0, -4.0, 2.2)])
    hero(c, 0.0, 0.6, 0.3)
    return c


# ------------------------------------------------------------ грибная пещера
def build_mushrooms():
    c = zone_setup('mushrooms', '#4f5a3a')
    place(c, 'mushroom_patriarch', 14.5, 11.0, 0.4)
    place(c, 'mushroom_big_a', -11.0, 7.0, 0.2)
    place(c, 'mushroom_big_b', -5.5, 10.0, 1.3)
    place(c, 'mushroom_big_c', 7.0, -8.5, 2.1)
    place(c, 'mushroom_big_a', 3.5, 10.5, 2.8, 0.9)
    place(c, 'puffball_a', -13.0, -4.0, 0.5)
    place(c, 'puffball_b', 10.0, -1.0, 1.1)
    place(c, 'root_ridge_9', -6.5, -10.0, 0.25)
    place(c, 'root_ridge_5', 15.5, -7.5, -0.7)
    place(c, 'rock_ridge_10', -19.5, 1.0, 1.35)
    place(c, 'stalagmite_b', -15.5, 10.5, 0.0)
    place(c, 'stalagmite_a', 18.5, 0.5, 1.0)
    scatter(c, ['floor_decal_kit_moss', 'floor_decal_kit_pebbles', 'floor_decal_kit_shroomlets'], 12, 6,
            [(0, 0.6, 2.5), (14.5, 11.0, 7.5)])
    # дуга Ведьмина круга: центр круга за нижним краем
    cx, cy, R = -1.5, -15.0, 12.5
    for a in (52, 72, 92, 112, 132):
        t = math.radians(a)
        place(c, 'ring_mushroom', cx + R * math.cos(t), cy + R * math.sin(t), t)
        light(c, cx + R * math.cos(t), cy + R * math.sin(t), 1.3, 160, '#ffcf6a', 0.3)
    for nm, x, y, r in [('mushroom_cluster_a', -8.0, 2.5, 0.0), ('mushroom_cluster_b', 4.5, 4.0, 1.0),
                        ('mushroom_cluster_c', -15.0, 2.5, 2.0), ('mushroom_cluster_a', 12.5, 3.5, 3.0),
                        ('mushroom_cluster_c', 0.5, -12.0, 0.5), ('mushroom_cluster_b', -3.0, 7.0, 2.4),
                        ('floor_decal_kit_moss', -9.5, -6.0, 0.2), ('floor_decal_kit_moss', 6.0, 1.0, 1.4),
                        ('floor_decal_kit_moss', 1.0, 7.5, 2.8), ('floor_decal_kit_shroomlets', -4.0, -4.0, 0.0),
                        ('floor_decal_kit_shroomlets', 9.0, 7.0, 1.0), ('floor_decal_kit_pebbles', 16.5, -2.0, 0.6),
                        ('floor_decal_kit_moss', 13.0, -11.0, 0.0), ('floor_decal_kit_jam_drops', -1.0, 2.0, 0.9)]:
        place(c, nm, x, y, r)
    # свет: под шляпками — тёплый жёлто-зелёный
    for (x, y, w) in [(-11.0, 7.0, 500), (-5.5, 10.0, 420), (7.0, -8.5, 520), (3.5, 10.5, 380)]:
        light(c, x, y - 0.6, 1.8, w, '#ffd36e', 0.5)
    for (x, y) in [(10.0, 7.5), (16.0, 6.0), (11.0, 12.5)]:
        light(c, x, y, 3.5, 1100, '#ffc86a', 1.0)
    put_mob(c, 'shroom', [(-3.5, 3.0, 2.8), (-5.0, 1.5, 2.2), (4.5, -3.0, -2.2), (2.8, 4.6, 3.4)])
    put_mob(c, 'slug', [(-8.0, -2.5, 0.8), (8.5, 3.0, -2.5)])
    put_mob(c, 'rat', [(-1.5, -7.0, 0.2), (-0.6, -7.8, 0.4), (-2.4, -8.2, 0.1)])
    hero(c, 0.0, 0.6, -0.2)
    return c


# ------------------------------------------------------------ кристальный грот
def build_grotto():
    c = zone_setup('grotto', '#30535a')
    lake(c, -9.5, 6.5, 8.0, 10.8)
    place(c, 'lake_island', -9.5, 6.5, 0.6)
    place(c, 'crystal_druse', 12.0, 8.0, 0.3)
    place(c, 'crystal_cluster_l', 3.0, 11.0, 1.0)
    place(c, 'crystal_cluster_m', -3.0, -8.5, 2.0)
    place(c, 'crystal_cluster_m', 16.5, -4.5, 0.6)
    place(c, 'crystal_cluster_s', 7.5, 3.5, 0.0)
    place(c, 'crystal_cluster_s', -14.5, -6.0, 2.0)
    place(c, 'crystal_cluster_s', 1.5, -11.5, 4.0)
    place(c, 'crystal_fangs', 5.5, -4.0, 0.05)
    place(c, 'stalagmite_c', -16.0, -1.5, 0.0)
    place(c, 'stalagmite_b', 18.5, 3.0, 2.0)
    place(c, 'stalagmite_a', -5.5, -3.5, 1.0)
    place(c, 'stalagmite_d', 9.0, -11.0, 0.5)
    place(c, 'rock_ridge_14', 13.5, -12.5, 0.15)
    place(c, 'rock_mass_b', -21.0, -12.0, 0.8)
    scatter(c, ['floor_decal_kit_pebbles', 'floor_decal_kit_crystal_shards', 'floor_decal_kit_crack',
                'floor_decal_kit_gravel'], 14, 7, [(-9.5, 6.5, 11.0), (0, 0.6, 2.5)])
    for nm, x, y, r in [('floor_decal_kit_crystal_shards', -1.0, 3.5, 0.0), ('floor_decal_kit_crystal_shards', 9.5, -1.5, 1.0),
                        ('floor_decal_kit_crystal_shards', -9.0, -9.5, 2.0), ('floor_decal_kit_pebbles', 0.5, -5.0, 0.4),
                        ('floor_decal_kit_gravel', 14.5, 2.0, 1.1), ('floor_decal_kit_slabs', -6.0, -6.5, 2.7),
                        ('floor_decal_kit_crack', 4.0, 6.0, 0.6)]:
        place(c, nm, x, y, r)
    for nm, x, y in [('torch_stand_floor', -1.5, 5.5), ('torch_stand_floor', 15.5, -0.5)]:
        place(c, nm, x, y)
        light(c, x, y, 2.0, 350, '#ffa04a', 0.2)
    # бирюзовый свет кристаллов
    for (x, y, z, w) in [(12.0, 8.0, 3.0, 2200), (-9.5, 6.5, 2.0, 900), (3.0, 11.0, 1.8, 700), (-3.0, -8.5, 1.5, 450),
                         (16.5, -4.5, 1.5, 450), (1.4, -4.0, 1.5, 300), (9.6, -4.0, 1.5, 300), (7.5, 3.5, 0.9, 140),
                         (-14.5, -6.0, 0.9, 140), (1.5, -11.5, 0.9, 140)]:
        light(c, x, y, z + 0.6, w * 3.0, '#5fc4b8', 1.0)
    add_light('fill_cool', 'SUN', (0, 0, 10), 1.2, '#a9d8d8', c, rot=(math.radians(50), math.radians(15), math.radians(140)))
    put_mob(c, 'beetle', [(-2.5, 1.5, 2.6), (6.0, 2.0, -2.4)])
    put_mob(c, 'rat', [(3.0, -6.5, -0.5), (3.8, -7.4, -0.3), (2.2, -7.6, -0.7)])
    put_mob(c, 'slug', [(-6.5, -1.0, 1.3)])
    put_mob(c, 'spitter', [(8.5, 5.0, -2.8)])
    hero(c, 0.0, 0.6, 0.2)
    return c


BUILD = {'cellars': build_cellars, 'mushrooms': build_mushrooms, 'grotto': build_grotto}
OFF = {'cellars': 0.0, 'mushrooms': 120.0, 'grotto': 240.0}

world_color('#3a2b21', 1.6)
set_engine(SC)
colls = {}
for z in ('cellars', 'mushrooms', 'grotto'):
    c = BUILD[z]()
    # слабое «полусферное» небо: солнце-заполнитель на каждую зону
    add_light('fill_' + z, 'SUN', (0, 0, 10), 1.5, '#ffd8b0', c,
              rot=(math.radians(35), math.radians(-12), math.radians(-25)))
    for o in c.objects:
        if o.parent is None:
            o.location.x += OFF[z]
    colls[z] = c

# камера игры: наклон 62°, FOV по вертикали 36°, 31 м до героя
rig = get_coll('diorama_cams')
cams = {}
for z in ('cellars', 'mushrooms', 'grotto'):
    cam = camera_at('cam_' + z, rig, (OFF[z], -1.4, 0.0), 62.0, 31.0, 0.0, fov_v_deg=36.0)
    cams[z] = cam

save_as(BL + 'diorama_a.blend')

if not NO_RENDER:
    for z in ZONES:
        for zz, c in colls.items():
            hide = zz != z
            c.hide_render = hide
            for o in c.all_objects:
                o.hide_render = hide
        SC.camera = cams[z]
        render_to(ROOT + '/docs/survivors/models/previews/diorama_%s.png' % z, (1600, 900), samples=48)
    for c in colls.values():
        c.hide_render = False
        for o in c.all_objects:
            o.hide_render = False
    save_as(BL + 'diorama_a.blend')
print('diorama done', ZONES)
