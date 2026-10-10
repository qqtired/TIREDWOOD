# TIREDWOOD farm — helper library for building stylised props in Blender 5.x.
# Loaded by art/farm/scripts/build.py (background Blender: Blender -b --factory-startup --python build.py -- <ids>).
import bpy, bmesh, math, random, os
from mathutils import Vector, Matrix, Euler, Quaternion, noise
from mathutils.bvhtree import BVHTree

ROOT = '/Users/tired/Desktop/game-opus-farm'
BLEND_DIR = ROOT + '/art/farm/blend'
GLB_DIR = ROOT + '/client/assets/farm/models'
PNG_DIR = ROOT + '/art/farm/renders'
TAU = math.pi * 2

# ------------------------------------------------------------------ colour

def hexc(h):
    if isinstance(h, (tuple, list)):
        return tuple(h[:3])
    if isinstance(h, str):
        h = int(h.lstrip('#'), 16)
    return ((h >> 16 & 255) / 255, (h >> 8 & 255) / 255, (h & 255) / 255)

def s2l(c):
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4

def lin(c):
    c = hexc(c)
    return (s2l(c[0]), s2l(c[1]), s2l(c[2]), 1.0)

def lerp(a, b, t):
    return a + (b - a) * t

def mixc(a, b, t):
    a = hexc(a); b = hexc(b)
    t = max(0.0, min(1.0, t))
    return tuple(lerp(x, y, t) for x, y in zip(a, b))

def mulc(a, k):
    a = hexc(a)
    return tuple(max(0.0, min(1.0, x * k)) for x in a)

def jitter(c, amt, rng=random):
    c = hexc(c)
    k = 1 + (rng.random() * 2 - 1) * amt
    return tuple(max(0.0, min(1.0, x * k)) for x in c)

def smooth01(t):
    t = max(0.0, min(1.0, t))
    return t * t * (3 - 2 * t)

# ------------------------------------------------------------------ materials

MATS = {
    # name: (roughness, metallic, coat, double_sided, emission_hex, emission_strength, sheen)
    'farm_soft': (0.68, 0.0, 0.0, False, None, 0.0, 0.0),
    'farm_plant': (0.52, 0.0, 0.0, True, None, 0.0, 0.0),
    'farm_gloss': (0.26, 0.0, 0.35, False, None, 0.0, 0.0),
    'farm_metal': (0.34, 0.75, 0.0, False, None, 0.0, 0.0),
    'farm_wet': (0.48, 0.0, 0.06, False, None, 0.0, 0.0),
    'farm_water': (0.12, 0.0, 0.4, False, None, 0.0, 0.0),
    'farm_cloth': (0.8, 0.0, 0.0, True, None, 0.0, 0.0),
}

def mat(name):
    m = bpy.data.materials.get(name)
    if m:
        return m
    spec = MATS[name]
    rough, metal, coat, double, emit, emit_s, sheen = spec
    m = bpy.data.materials.new(name)
    try:
        m.use_nodes = True
    except Exception:
        pass
    nt = m.node_tree
    bsdf = next(n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED')
    ca = nt.nodes.new('ShaderNodeVertexColor')
    ca.layer_name = 'Col'
    ca.location = (-300, 200)
    nt.links.new(ca.outputs[0], bsdf.inputs['Base Color'])
    bsdf.inputs['Roughness'].default_value = rough
    bsdf.inputs['Metallic'].default_value = metal
    bsdf.inputs['Coat Weight'].default_value = coat
    bsdf.inputs['Coat Roughness'].default_value = 0.12
    if emit:
        bsdf.inputs['Emission Color'].default_value = lin(emit)
        bsdf.inputs['Emission Strength'].default_value = emit_s
    if name in ('farm_pearl',):
        try:
            bsdf.inputs['Thin Film Thickness'].default_value = 320.0
            bsdf.inputs['Thin Film IOR'].default_value = 1.45
        except Exception:
            pass
    m.use_backface_culling = not double
    try:
        m.diffuse_color = (0.8, 0.8, 0.8, 1)
    except Exception:
        pass
    return m

def glow_mat(name, emit_hex, strength=0.6, rough=0.3, coat=0.3):
    MATS[name] = (rough, 0.0, coat, False, emit_hex, strength, 0.0)
    return mat(name)

# ------------------------------------------------------------------ scene

def reset():
    try:
        if bpy.context.object and bpy.context.object.mode != 'OBJECT':
            bpy.ops.object.mode_set(mode='OBJECT')
    except Exception:
        pass
    for o in list(bpy.data.objects):
        bpy.data.objects.remove(o, do_unlink=True)
    for coll in (bpy.data.meshes, bpy.data.materials, bpy.data.curves, bpy.data.lights, bpy.data.cameras,
                 bpy.data.node_groups, bpy.data.actions):
        for d in list(coll):
            try:
                coll.remove(d)
            except Exception:
                pass
    for c in list(bpy.data.collections):
        bpy.data.collections.remove(c)
    for lib in list(bpy.data.libraries):
        try:
            bpy.data.libraries.remove(lib)
        except Exception:
            pass
    for im in list(bpy.data.images):
        if im.type not in ('RENDER_RESULT', 'COMPOSITING'):
            bpy.data.images.remove(im)
    sc = bpy.context.scene
    sc.unit_settings.system = 'METRIC'
    sc.unit_settings.scale_length = 1.0
    sc.frame_current = 1

# ------------------------------------------------------------------ builder

class Builder:
    """Accumulates coloured geometry in one bmesh; build() makes a mesh object."""

    def __init__(self, seed=1):
        self.bm = bmesh.new()
        self.col = self.bm.loops.layers.float_color.new('Col')
        self.mats = []
        self.rng = random.Random(seed)
        self.smooth_faces = set()

    def mi(self, matname):
        if matname not in self.mats:
            self.mats.append(matname)
        return self.mats.index(matname)

    # paint helpers ------------------------------------------------
    def paint(self, faces, col, matname='farm_soft', smooth=True, vcol=None):
        """col: hex/tuple, or callable(co: Vector, normal: Vector) -> rgb (sRGB). vcol: dict vert->rgb."""
        idx = self.mi(matname)
        for f in faces:
            f.material_index = idx
            f.smooth = smooth
            for lp in f.loops:
                if vcol is not None and lp.vert in vcol:
                    c = vcol[lp.vert]
                elif callable(col):
                    c = col(lp.vert.co, lp.vert.normal)
                else:
                    c = col
                lp[self.col] = lin(c)
        return faces

    def _faces_of(self, verts):
        vs = set(verts)
        fs = set()
        for v in verts:
            for f in v.link_faces:
                if all(x in vs for x in f.verts):
                    fs.add(f)
        return list(fs)

    # primitives ---------------------------------------------------
    def sphere(self, c, r, scale=(1, 1, 1), segs=16, rings=10, rot=(0, 0, 0), col=0xffffff, mat='farm_soft',
               smooth=True, ico=0, warp=None):
        M = Matrix.Translation(Vector(c)) @ Euler(rot).to_matrix().to_4x4() @ Matrix.Diagonal((*scale, 1))
        if ico:
            res = bmesh.ops.create_icosphere(self.bm, subdivisions=ico, radius=r, matrix=M)
        else:
            res = bmesh.ops.create_uvsphere(self.bm, u_segments=segs, v_segments=rings, radius=r, matrix=M)
        verts = res['verts']
        if warp:
            for v in verts:
                v.co = warp(v.co)
        faces = self._faces_of(verts)
        self.bm.normal_update()
        return self.paint(faces, col, mat, smooth)

    def cyl(self, p0, p1, r0, r1=None, segs=12, caps=True, col=0xffffff, mat='farm_soft', smooth=True, rot0=0.0):
        r1 = r0 if r1 is None else r1
        p0 = Vector(p0); p1 = Vector(p1)
        d = p1 - p0
        L = d.length
        q = Vector((0, 0, 1)).rotation_difference(d.normalized())
        M = Matrix.Translation((p0 + p1) / 2) @ q.to_matrix().to_4x4() @ Matrix.Rotation(rot0, 4, 'Z')
        res = bmesh.ops.create_cone(self.bm, cap_ends=caps, cap_tris=False, segments=segs, radius1=r0, radius2=r1,
                                    depth=L, matrix=M)
        faces = self._faces_of(res['verts'])
        self.bm.normal_update()
        # caps flat
        out = self.paint(faces, col, mat, smooth)
        if smooth:
            ax = d.normalized()
            for f in faces:
                if abs(f.normal.dot(ax)) > 0.95:
                    f.smooth = False
        return out

    def box(self, c, size, bevel=0.0, bseg=2, rot=(0, 0, 0), col=0xffffff, mat='farm_soft', taper=None):
        M = Matrix.Translation(Vector(c)) @ Euler(rot).to_matrix().to_4x4() @ Matrix.Diagonal((*size, 1))
        res = bmesh.ops.create_cube(self.bm, size=1.0, matrix=M)
        verts = res['verts']
        if taper:  # taper: (sx, sy) scale of the top face relative to bottom, in local box space
            inv = M.inverted()
            for v in verts:
                lc = inv @ v.co
                if lc.z > 0:
                    lc.x *= taper[0]; lc.y *= taper[1]
                    v.co = M @ lc
        faces = self._faces_of(verts)
        if bevel > 0:
            edges = list({e for f in faces for e in f.edges})
            r = bmesh.ops.bevel(self.bm, geom=edges + verts, offset=bevel, offset_type='OFFSET', segments=bseg,
                                profile=0.5, affect='EDGES', clamp_overlap=True)
            faces = list(set(faces) | set(r['faces']))
            faces = [f for f in faces if f.is_valid]
            # collect all faces connected (bevel may create new faces)
            vs = set()
            for f in faces:
                vs.update(f.verts)
            faces = self._faces_of(list(vs))
        self.bm.normal_update()
        self.paint(faces, col, mat, True)
        for f in faces:
            f.smooth = bevel > 0
        return faces

    def lathe(self, prof, segs=16, c=(0, 0, 0), col=0xffffff, mat='farm_soft', smooth=True, rmod=None, close_top=True,
              close_bot=True, rot=(0, 0, 0), arc=TAU):
        """prof: list of (r, z). rmod(angle, t, r, z) -> r multiplier (ribs). Poles where r==0."""
        R = Euler(rot).to_matrix()
        C = Vector(c)
        rings = []
        full = abs(arc - TAU) < 1e-6
        n_ang = segs if full else segs + 1
        for i, (r, z) in enumerate(prof):
            t = i / (len(prof) - 1)
            if r < 1e-5:
                rings.append([self.bm.verts.new(C + R @ Vector((0, 0, z)))])
                continue
            ring = []
            for k in range(n_ang):
                a = arc * k / segs
                rr = r * (rmod(a, t, r, z) if rmod else 1.0)
                ring.append(self.bm.verts.new(C + R @ Vector((rr * math.cos(a), rr * math.sin(a), z))))
            rings.append(ring)
        faces = []
        nseg = segs
        for i in range(len(rings) - 1):
            A, Bv = rings[i], rings[i + 1]
            for k in range(nseg):
                k1 = (k + 1) % n_ang if full else k + 1
                if len(A) == 1 and len(Bv) == 1:
                    continue
                if len(A) == 1:
                    vs = (A[0], Bv[k1], Bv[k]) if True else None
                elif len(Bv) == 1:
                    vs = (A[k], A[k1], Bv[0])
                else:
                    vs = (A[k], A[k1], Bv[k1], Bv[k])
                try:
                    faces.append(self.bm.faces.new(vs))
                except ValueError:
                    pass
        if close_bot and len(rings[0]) > 1 and full:
            try:
                f = self.bm.faces.new(list(reversed(rings[0])))
                faces.append(f)
            except ValueError:
                pass
        if close_top and len(rings[-1]) > 1 and full:
            try:
                faces.append(self.bm.faces.new(rings[-1]))
            except ValueError:
                pass
        self.bm.normal_update()
        # orientation: profile going upward with ccw angle gives inward normals when r grows? fix via check
        self._orient_out(faces, C)
        return self.paint(faces, col, mat, smooth)

    def _orient_out(self, faces, centre):
        # flip all faces if majority point toward the axis/centre
        score = 0.0
        for f in faces:
            c = f.calc_center_median()
            d = c - Vector(centre)
            d.z *= 0.3
            score += f.normal.dot(d)
        if score < 0:
            for f in faces:
                f.normal_flip()
            self.bm.normal_update()

    def tube(self, pts, radii, segs=8, cap0=True, cap1=True, col=0xffffff, mat='farm_soft', smooth=True, vcolfn=None, prof=None, twist=0.0):
        """pts list of points, radii list or float. vcolfn(t) -> rgb along the tube."""
        pts = [Vector(p) for p in pts]
        n = len(pts)
        if not hasattr(radii, '__len__'):
            radii = [radii] * n
        tans = []
        for i in range(n):
            if i == 0:
                t = pts[1] - pts[0]
            elif i == n - 1:
                t = pts[-1] - pts[-2]
            else:
                t = (pts[i + 1] - pts[i]).normalized() + (pts[i] - pts[i - 1]).normalized()
            tans.append(t.normalized())
        t0 = tans[0]
        ref = Vector((0, 0, 1)) if abs(t0.z) < 0.9 else Vector((1, 0, 0))
        nrm = t0.cross(ref).normalized()
        rings = []
        vcol = {}
        for i in range(n):
            if i > 0:
                ax = tans[i - 1].cross(tans[i])
                if ax.length > 1e-7:
                    ang = tans[i - 1].angle(tans[i])
                    nrm = Matrix.Rotation(ang, 3, ax.normalized()) @ nrm
            b = tans[i].cross(nrm).normalized()
            nn = b.cross(tans[i]).normalized()
            r = radii[i]
            tt = i / (n - 1)
            cc = vcolfn(tt) if vcolfn else None
            if r < 1e-5:
                v = self.bm.verts.new(pts[i])
                rings.append([v])
                if cc: vcol[v] = cc
                continue
            ring = []
            for k in range(segs):
                a = TAU * k / segs + twist * tt
                rk = r * (prof[k % len(prof)] if prof else 1.0)
                v = self.bm.verts.new(pts[i] + (nn * math.cos(a) + b * math.sin(a)) * rk)
                ring.append(v)
                if cc: vcol[v] = cc
            rings.append(ring)
        faces = []
        for i in range(n - 1):
            A, Bv = rings[i], rings[i + 1]
            for k in range(segs):
                k1 = (k + 1) % segs
                if len(A) == 1 and len(Bv) == 1:
                    continue
                if len(A) == 1:
                    vs = (A[0], Bv[k1], Bv[k])
                elif len(Bv) == 1:
                    vs = (A[k], A[k1], Bv[0])
                else:
                    vs = (A[k], A[k1], Bv[k1], Bv[k])
                faces.append(self.bm.faces.new(vs))
        # rounded caps
        if cap0 and len(rings[0]) > 1:
            tip = self.bm.verts.new(pts[0] - tans[0] * radii[0] * 0.6)
            if vcolfn: vcol[tip] = vcolfn(0)
            R = rings[0]
            for k in range(segs):
                faces.append(self.bm.faces.new((R[(k + 1) % segs], R[k], tip)))
        if cap1 and len(rings[-1]) > 1:
            tip = self.bm.verts.new(pts[-1] + tans[-1] * radii[-1] * 0.6)
            if vcolfn: vcol[tip] = vcolfn(1)
            R = rings[-1]
            for k in range(segs):
                faces.append(self.bm.faces.new((R[k], R[(k + 1) % segs], tip)))
        self.bm.normal_update()
        return self.paint(faces, col, mat, smooth, vcol=vcol if vcolfn else None)

    def leaf(self, base, yaw, pitch, length, width, bend=-0.6, curl=0.25, fold=0.15, nu=6, nv=2, shape='oval',
             col=0x5fb84a, col_tip=None, col_base=None, rib=None, mat='farm_plant', twist=0.0, roll=0.0,
             wfn=None, wave=0.0, blunt=None, udist=None):
        """Leaf blade as a grid. pitch: elevation at base (rad, +up). bend: change of pitch to the tip.
        nv: half-count across (per side)."""
        base = Vector(base)
        h = Vector((math.cos(yaw), math.sin(yaw), 0))
        Z = Vector((0, 0, 1))
        side0 = Z.cross(h).normalized()
        if wfn is None:
            if shape == 'oval':
                wfn = lambda u: math.sin(math.pi * min(1, u * 0.92 + 0.04)) ** 0.75
            elif shape == 'lance':
                wfn = lambda u: (math.sin(math.pi * u) ** 0.9) * (1 - 0.3 * u)
            elif shape == 'round':
                wfn = lambda u: math.sin(math.pi * min(1, u * 0.85 + 0.08)) ** 0.5
            elif shape == 'heart':
                wfn = lambda u: (math.sin(math.pi * min(1, u * 0.8 + 0.18)) ** 0.6)
            elif shape == 'strap':
                wfn = lambda u: min(1, u * 6) * (1 - u ** 3) ** 0.8
            elif shape == 'petal':
                wfn = lambda u: math.sin(math.pi * min(1, u * 0.75 + 0.1)) ** 0.55
            elif shape == 'ellipse':
                wfn = lambda u: math.sqrt(max(0.0, 1 - (2 * u - 1) ** 2))
            elif shape == 'spoon':
                wfn = lambda u: math.sqrt(max(0.0, 1 - ((u - 0.62) / 0.62) ** 2)) * (0.35 + 0.65 * min(1, u * 2.5))
        if blunt is None:
            blunt = False
        col_tip = col if col_tip is None else col_tip
        col_base = col if col_base is None else col_base
        rib = mixc(col, 0xf4ffd0, 0.35) if rib is None else rib
        pos = Vector(base)
        rows = []
        vcol = {}
        if udist == 'tip':
            us = [math.sin(i / nu * math.pi / 2) for i in range(nu + 1)]
        elif udist == 'both':
            us = [0.5 - 0.5 * math.cos(i / nu * math.pi) for i in range(nu + 1)]
        else:
            us = [i / nu for i in range(nu + 1)]
        for i in range(nu + 1):
            u = us[i]
            step = (us[i + 1] - u) * length if i < nu else 0.0
            p = pitch + bend * u
            d = h * math.cos(p) + Z * math.sin(p)
            rmat = Matrix.Rotation(twist * u + roll, 3, d)
            side = rmat @ side0
            up = d.cross(side).normalized()
            w = width * 0.5 * wfn(u)
            row = []
            if (i == nu and not blunt) or w < 1e-4:
                v = self.bm.verts.new(pos.copy())
                vcol[v] = mixc(col, col_tip, u)
                row = [v] * (2 * nv + 1)
                rows.append(row)
            else:
                for j in range(-nv, nv + 1):
                    s = j / nv
                    off = side * (s * w) + up * ((s * s) * curl * w - abs(s) * fold * w)
                    if blunt and i == nu:
                        off = off * 0.6 - d * (s * s) * w * 0.7
                    if wave:
                        off += up * (math.sin(u * 9 + s * 2) * wave * w)
                    v = self.bm.verts.new(pos + off)
                    base_c = mixc(col_base, col, min(1, u * 2.5))
                    c = mixc(base_c, col_tip, u ** 1.5)
                    if j == 0:
                        c = mixc(c, rib, 0.6)
                    else:
                        c = mulc(c, 1.0 - 0.07 * abs(s))
                    vcol[v] = c
                    row.append(v)
                rows.append(row)
            pos = pos + d * step
        faces = []
        for i in range(nu):
            A, Bv = rows[i], rows[i + 1]
            for j in range(2 * nv):
                vs = [A[j], A[j + 1], Bv[j + 1], Bv[j]]
                # remove duplicates (tip)
                uniq = []
                for v in vs:
                    if v not in uniq:
                        uniq.append(v)
                if len(uniq) >= 3:
                    try:
                        faces.append(self.bm.faces.new(uniq))
                    except ValueError:
                        pass
        self.bm.normal_update()
        # make normals point "up" of the leaf
        upz = 0
        for f in faces:
            upz += f.normal.z
        if upz < 0:
            for f in faces:
                f.normal_flip()
        self.bm.normal_update()
        return self.paint(faces, col, mat, True, vcol=vcol)

    def torus(self, c, R, r, segs=16, rsegs=6, rot=(0, 0, 0), col=0xffffff, mat='farm_soft', scale=(1, 1, 1)):
        M = Matrix.Translation(Vector(c)) @ Euler(rot).to_matrix().to_4x4() @ Matrix.Diagonal((*scale, 1))
        rings = []
        for i in range(segs):
            a = TAU * i / segs
            ring = []
            for k in range(rsegs):
                b = TAU * k / rsegs
                p = Vector(((R + r * math.cos(b)) * math.cos(a), (R + r * math.cos(b)) * math.sin(a), r * math.sin(b)))
                ring.append(self.bm.verts.new(M @ p))
            rings.append(ring)
        faces = []
        for i in range(segs):
            A, Bv = rings[i], rings[(i + 1) % segs]
            for k in range(rsegs):
                k1 = (k + 1) % rsegs
                faces.append(self.bm.faces.new((A[k], Bv[k], Bv[k1], A[k1])))
        self.bm.normal_update()
        self._orient_torus(faces, M @ Vector((0, 0, 0)), R, M)
        return self.paint(faces, col, mat, True)

    def _orient_torus(self, faces, centre, R, M):
        inv = M.inverted()
        score = 0
        for f in faces:
            lc = inv @ f.calc_center_median()
            ring_c = Vector((lc.x, lc.y, 0))
            if ring_c.length > 1e-6:
                ring_c = ring_c.normalized() * R
            d = (M @ lc) - (M @ ring_c)
            score += f.normal.dot(d)
        if score < 0:
            for f in faces:
                f.normal_flip()
            self.bm.normal_update()

    def grid(self, fn, nu, nv, col=0xffffff, mat='farm_soft', smooth=True, colfn=None, wrap_v=False, orient='up', centre=(0, 0, 0)):
        """Generic param surface: fn(u, v) -> Vector (u,v in 0..1). colfn(u,v)->rgb"""
        nvv = nv if wrap_v else nv + 1
        rows = []
        vcol = {}
        for i in range(nu + 1):
            row = []
            for j in range(nvv):
                u, v = i / nu, j / nv
                vert = self.bm.verts.new(fn(u, v))
                if colfn:
                    vcol[vert] = colfn(u, v)
                row.append(vert)
            rows.append(row)
        faces = []
        for i in range(nu):
            for j in range(nv):
                j1 = (j + 1) % nvv if wrap_v else j + 1
                vs = [rows[i][j], rows[i][j1], rows[i + 1][j1], rows[i + 1][j]]
                try:
                    faces.append(self.bm.faces.new(vs))
                except ValueError:
                    pass
        self.bm.normal_update()
        if orient == 'up':
            if sum(f.normal.z for f in faces) < 0:
                for f in faces:
                    f.normal_flip()
                self.bm.normal_update()
        elif orient == 'out':
            self._orient_out(faces, Vector(centre))
        return self.paint(faces, col, mat, smooth, vcol=vcol if colfn else None)

    def displace(self, faces, amp, freq, seed=0, axis=None):
        vs = {v for f in faces for v in f.verts}
        off = Vector((seed * 7.1, seed * 3.3, seed * 5.7))
        for v in vs:
            n = noise.noise(v.co * freq + off)
            if axis is None:
                v.co += v.normal * n * amp
            else:
                v.co += Vector(axis) * n * amp
        self.bm.normal_update()

    def transform(self, faces, M):
        vs = {v for f in faces for v in f.verts}
        for v in vs:
            v.co = M @ v.co
        self.bm.normal_update()
        return faces

    def protect(self, faces):
        """Keep these faces out of fit_tris decimation (e.g. a body with colour stripes)."""
        lay = self.bm.verts.layers.int.get('protect') or self.bm.verts.layers.int.new('protect')
        for f in faces:
            for v in f.verts:
                v[lay] = 1

    def build(self, name, ao=None, ground_ao=(0.12, 0.7), sharp_angle=None, coll=None, merge=0.0):
        bm = self.bm
        if merge > 0:
            bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=merge)
        bm.normal_update()
        me = bpy.data.meshes.new(name)
        bm.to_mesh(me)
        bm.free()
        for mn in self.mats:
            me.materials.append(mat(mn))
        ob = bpy.data.objects.new(name, me)
        (coll or bpy.context.scene.collection).objects.link(ob)
        if sharp_angle is not None:
            try:
                me.set_sharp_from_angle(angle=math.radians(sharp_angle))
            except Exception as e:
                print('sharp', e)
        if ground_ao:
            apply_ground_ao(ob, *ground_ao)
        if ao:
            bake_ao(ob, **ao)
        me.color_attributes.active_color = me.color_attributes['Col']
        try:
            me.color_attributes.render_color_index = me.color_attributes.find('Col')
        except Exception:
            pass
        return ob

# ------------------------------------------------------------------ vertex AO

def apply_ground_ao(ob, h=0.12, k=0.7):
    me = ob.data
    ca = me.color_attributes['Col']
    for poly in me.polygons:
        for li in poly.loop_indices:
            z = me.vertices[me.loops[li].vertex_index].co.z
            if z < h:
                t = smooth01(z / h)
                m = lerp(k, 1.0, t)
                c = ca.data[li].color
                ca.data[li].color = (c[0] * m, c[1] * m, c[2] * m, c[3])

def bake_ao(ob, samples=20, dist=0.35, strength=0.55, extra=None, floor=True, seed=3):
    """Ray-cast hemisphere occlusion per vertex; multiplies loop colours. extra: other objects to occlude."""
    me = ob.data
    dg = bpy.context.evaluated_depsgraph_get()
    bms = []
    bm = bmesh.new()
    bm.from_mesh(me)
    if extra:
        for e in extra:
            t = bmesh.new()
            t.from_mesh(e.data)
            t.transform(ob.matrix_world.inverted() @ e.matrix_world)
            tm = bpy.data.meshes.new('_tmp')
            t.to_mesh(tm)
            t.free()
            bm.from_mesh(tm)
            bpy.data.meshes.remove(tm)
    if floor:
        # big floor quad at z=0
        s = 50
        vs = [bm.verts.new(p) for p in ((-s, -s, -0.001), (s, -s, -0.001), (s, s, -0.001), (-s, s, -0.001))]
        bm.faces.new(vs)
    bvh = BVHTree.FromBMesh(bm)
    bm.free()
    rng = random.Random(seed)
    dirs = []
    for i in range(samples):
        # cosine-weighted hemisphere around +Z
        u1 = (i + rng.random()) / samples
        u2 = rng.random()
        r = math.sqrt(u1)
        th = TAU * u2
        dirs.append(Vector((r * math.cos(th), r * math.sin(th), math.sqrt(max(0, 1 - u1)))))
    me.calc_loop_triangles()
    occ = []
    for v in me.vertices:
        n = v.normal
        q = Vector((0, 0, 1)).rotation_difference(n)
        o = v.co + n * 0.004
        hit = 0
        for d in dirs:
            dd = q @ d
            loc, nor, idx, dd2 = bvh.ray_cast(o, dd, dist)
            if loc is not None:
                hit += 1.0 - (dd2 / dist) * 0.5
        occ.append(hit / samples)
    ca = me.color_attributes['Col']
    for li, lp in enumerate(me.loops):
        a = occ[lp.vertex_index]
        m = 1.0 - strength * a
        c = ca.data[li].color
        ca.data[li].color = (c[0] * m, c[1] * m, c[2] * m, c[3])

# ------------------------------------------------------------------ utils

def tris(ob):
    me = ob.data
    return sum(len(p.vertices) - 2 for p in me.polygons)

def join(objs, name):
    """Join mesh objects into the first; keeps materials (by name)."""
    objs = [o for o in objs if o]
    if len(objs) == 1:
        objs[0].name = name
        objs[0].data.name = name
        return objs[0]
    bm = bmesh.new()
    mats = []
    for o in objs:
        for m in o.data.materials:
            if m.name not in mats:
                mats.append(m.name)
    for o in objs:
        remap = [mats.index(m.name) for m in o.data.materials]
        t = o.data.copy()
        t.transform(o.matrix_world)
        for p in t.polygons:
            p.material_index = remap[p.material_index] if remap else 0
        bm.from_mesh(t)
        bpy.data.meshes.remove(t)
    for o in objs:
        me = o.data
        bpy.data.objects.remove(o, do_unlink=True)
        if me.users == 0:
            bpy.data.meshes.remove(me)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    for mn in mats:
        me.materials.append(bpy.data.materials[mn])
    ob = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(ob)
    return ob

def report(objs):
    out = []
    tot = 0
    for o in objs:
        t = tris(o)
        tot += t
        out.append(f'{o.name}:{t}')
    print(' '.join(out), 'total', tot)
    return tot

def bbox(objs):
    bpy.context.view_layer.update()
    lo = Vector((1e9, 1e9, 1e9)); hi = Vector((-1e9, -1e9, -1e9))
    for o in objs:
        for c in o.bound_box:
            w = o.matrix_world @ Vector(c)
            lo = Vector((min(lo.x, w.x), min(lo.y, w.y), min(lo.z, w.z)))
            hi = Vector((max(hi.x, w.x), max(hi.y, w.y), max(hi.z, w.z)))
    return lo, hi

# ------------------------------------------------------------------ preview / export

EVENING = True  # game palette: low warm sun (client/render/sky.ts EVENING, lobby/world.ts SUN 0xffc48a)

def setup_preview(sky=None, ground=None, sun_rot=None, sun_strength=None, ground_size=30):
    if EVENING:
        sky = sky or 0xb9c6dc
        ground = ground or 0x93a86a
        sun_rot = sun_rot or (68, 0, -50)
        sun_strength = sun_strength or 4.2
        sun_col = (1.0, 0.77, 0.54)
    else:
        sky = sky or 0xcde6f5
        ground = ground or 0xd3dbb8
        sun_rot = sun_rot or (52, 0, 35)
        sun_strength = sun_strength or 3.6
        sun_col = (1.0, 0.95, 0.86)
    sc = bpy.context.scene
    try:
        sc.render.engine = 'BLENDER_EEVEE'
    except TypeError as e:
        print(e)
    sc.render.resolution_x = 512
    sc.render.resolution_y = 512
    sc.render.resolution_percentage = 100
    sc.render.film_transparent = False
    vt_ok = False
    for vt in (('ACES 1.3', 'ACES 2.0', 'AgX') if EVENING else ('Standard',)):
        try:
            sc.view_settings.view_transform = vt
            vt_ok = True
            break
        except Exception:
            pass
    sc.view_settings.exposure = 0.0 if EVENING else -0.4
    w = bpy.data.worlds.get('farm_world') or bpy.data.worlds.new('farm_world')
    sc.world = w
    try:
        w.use_nodes = True
    except Exception:
        pass
    bg = next(n for n in w.node_tree.nodes if n.type == 'BACKGROUND')
    bg.inputs[0].default_value = lin(sky)
    bg.inputs[1].default_value = 1.0 if EVENING else 1.1
    if not bpy.data.objects.get('_sun'):
        ld = bpy.data.lights.new('_sun', 'SUN')
        ld.energy = sun_strength
        ld.color = sun_col
        ld.angle = math.radians(6)
        so = bpy.data.objects.new('_sun', ld)
        bpy.context.scene.collection.objects.link(so)
        so.rotation_euler = Euler([math.radians(a) for a in sun_rot])
    if not bpy.data.objects.get('_ground'):
        me = bpy.data.meshes.new('_ground')
        bm = bmesh.new()
        bmesh.ops.create_circle(bm, cap_ends=True, segments=48, radius=ground_size)
        bm.to_mesh(me); bm.free()
        g = bpy.data.objects.new('_ground', me)
        bpy.context.scene.collection.objects.link(g)
        gm = bpy.data.materials.get('_ground_mat') or bpy.data.materials.new('_ground_mat')
        try:
            gm.use_nodes = True
        except Exception:
            pass
        b = next(n for n in gm.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
        b.inputs['Base Color'].default_value = lin(ground)
        b.inputs['Roughness'].default_value = 0.9
        me.materials.append(gm)
        g.location.z = -0.002
    if not bpy.data.objects.get('_cam'):
        cd = bpy.data.cameras.new('_cam')
        co = bpy.data.objects.new('_cam', cd)
        bpy.context.scene.collection.objects.link(co)
    sc.camera = bpy.data.objects['_cam']
    try:
        sc.eevee.use_shadows = True
    except Exception:
        pass

def frame_camera(objs, yaw=-35, pitch=24, lens=50, margin=1.15, look_z=None):
    cam = bpy.data.objects['_cam']
    cam.data.lens = lens
    lo, hi = bbox(objs)
    c = (lo + hi) / 2
    if look_z is not None:
        c.z = look_z
    rad = max((hi - lo).length / 2, 0.05)
    fov = 2 * math.atan(18 / lens)  # 36mm sensor
    dist = rad * margin / math.sin(fov / 2)
    y = math.radians(yaw); p = math.radians(pitch)
    d = Vector((math.sin(y) * math.cos(p), -math.cos(y) * math.cos(p), math.sin(p)))
    cam.location = c + d * dist
    cam.rotation_euler = (-d).to_track_quat('-Z', 'Y').to_euler()
    cam.data.clip_end = dist * 4 + 50

def render_png(path):
    bpy.context.scene.render.filepath = path
    bpy.context.scene.render.image_settings.file_format = 'PNG'
    bpy.ops.render.render(write_still=True)

def hide_helpers(hide=True):
    for n in ('_ground', '_sun', '_cam'):
        o = bpy.data.objects.get(n)
        if o:
            o.hide_render = False

def export_glb(objs, path):
    for o in bpy.context.scene.objects:
        o.select_set(False)
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.export_scene.gltf(filepath=path, export_format='GLB', use_selection=True, export_yup=True,
                              export_apply=True, export_texcoords=False, export_normals=True,
                              export_materials='EXPORT', export_vertex_color='ACTIVE', export_cameras=False,
                              export_lights=False, export_animations=False, export_extras=True)

def save_blend(name):
    try:
        bpy.context.preferences.filepaths.save_version = 0  # no .blend1 backups
    except Exception:
        pass
    bpy.ops.wm.save_as_mainfile(filepath=f'{BLEND_DIR}/{name}.blend', compress=True)

SCR = os.environ.get('FARM_TMP', '/tmp/farm-art')  # scratch renders for quick checks
os.makedirs(SCR, exist_ok=True)

def preview(objs, path, yaw=-30, pitch=28, margin=0.8, lens=50, look_z=None, size=512):
    setup_preview()
    bpy.context.scene.render.resolution_x = size
    bpy.context.scene.render.resolution_y = size
    frame_camera(objs, yaw=yaw, pitch=pitch, lens=lens, margin=margin, look_z=look_z)
    render_png(path)

def spread(objs, gap=0.25, axis=0):
    """Lay objects side by side along X (for previews). Returns original locations."""
    x = 0.0
    widths = []
    for o in objs:
        lo, hi = bbox([o])
        widths.append((lo, hi))
    total = sum((hi - lo)[axis] for lo, hi in widths) + gap * (len(objs) - 1)
    x = -total / 2
    for o, (lo, hi) in zip(objs, widths):
        w = (hi - lo)[axis]
        loc = list(o.location)
        loc[axis] = x - (lo[axis] - o.location[axis]) 
        o.location = loc
        x += w + gap

def to_origin(objs):
    for o in objs:
        o.location = (0, 0, 0)

def wood_fn(base=0xc68a52, dark=None, light=None, grain=1.0, seed=0, axis='x', freq=1.0):
    """Returns colfn(local co) for plank grain stretched along `axis`."""
    dark = mulc(base, 0.78) if dark is None else dark
    light = mixc(base, 0xffe2b8, 0.25) if light is None else light
    off = Vector((seed * 1.7, seed * 2.3, seed * 0.7))
    def f(co):
        if axis == 'x':
            p = Vector((co.x * 2.0 * freq, co.y * 30 * freq, co.z * 30 * freq))
        elif axis == 'y':
            p = Vector((co.x * 30 * freq, co.y * 2.0 * freq, co.z * 30 * freq))
        else:
            p = Vector((co.x * 30 * freq, co.y * 30 * freq, co.z * 2.0 * freq))
        n = noise.noise(p + off) * grain
        n2 = noise.noise(co * 6 * freq + off)
        c = mixc(base, dark, max(0, n) * 0.9)
        c = mixc(c, light, max(0, -n) * 0.6)
        return mulc(c, 1 + n2 * 0.06)
    return f

def _rr_ring(hy, hz, r, rseg):
    pts = []
    r = min(r, hy * 0.999, hz * 0.999)
    corners = [((hy - r), (hz - r), 0.0), (-(hy - r), (hz - r), math.pi / 2), (-(hy - r), -(hz - r), math.pi), ((hy - r), -(hz - r), 1.5 * math.pi)]
    for cy, cz, a0 in corners:
        for s in range(rseg + 1):
            a = a0 + (math.pi / 2) * s / rseg
            pts.append((cy + r * math.cos(a), cz + r * math.sin(a)))
    return pts

def _rbox(self, c, size, r=0.01, rseg=2, nx=4, rot=(0, 0, 0), col=0xc68a52, colfn=None, mat='farm_soft', end_r=None,
          bend=None, taper=None):
    """Rounded plank along local X. size=(sx,sy,sz). bend(x)->(dy,dz) offset. taper(t)->scale of the ring."""
    hx, hy, hz = size[0] / 2, size[1] / 2, size[2] / 2
    end_r = r if end_r is None else end_r
    M = Matrix.Translation(Vector(c)) @ Euler(rot).to_matrix().to_4x4()
    ring = _rr_ring(hy, hz, r, rseg)
    xs = []
    if end_r > 0:
        xs.append((-hx, 1.0 - 0.0, True))
        xs.append((-hx + end_r * 0.5, 1.0, False))
    for i in range(nx + 1):
        x = -hx + end_r + (2 * hx - 2 * end_r) * i / nx
        xs.append((x, 1.0, False))
    if end_r > 0:
        xs.append((hx - end_r * 0.5, 1.0, False))
        xs.append((hx, 1.0, True))
    rings = []
    vcol = {}
    for (x, s, is_end) in xs:
        t = (x + hx) / (2 * hx)
        sc = taper(t) if taper else 1.0
        dy, dz = bend(x) if bend else (0, 0)
        row = []
        for (y, z) in ring:
            if is_end:
                yy = math.copysign(max(abs(y) - end_r * 0.7, abs(y) * 0.2), y)
                zz = math.copysign(max(abs(z) - end_r * 0.7, abs(z) * 0.2), z)
            elif abs(x) > hx - end_r * 0.75 and end_r > 0:
                yy = math.copysign(max(abs(y) - end_r * 0.2, 0), y); zz = math.copysign(max(abs(z) - end_r * 0.2, 0), z)
            else:
                yy, zz = y, z
            lc = Vector((x, yy * sc + dy, zz * sc + dz))
            v = self.bm.verts.new(M @ lc)
            vcol[v] = colfn(lc) if colfn else hexc(col)
            row.append(v)
        rings.append(row)
    faces = []
    n = len(ring)
    for i in range(len(rings) - 1):
        A, Bv = rings[i], rings[i + 1]
        for k in range(n):
            k1 = (k + 1) % n
            faces.append(self.bm.faces.new((A[k], A[k1], Bv[k1], Bv[k])))
    faces.append(self.bm.faces.new(list(reversed(rings[0]))))
    faces.append(self.bm.faces.new(rings[-1]))
    self.bm.normal_update()
    self.paint(faces, col, mat, True, vcol=vcol)
    faces[-1].smooth = False
    faces[-2].smooth = False
    return faces

Builder.rbox = _rbox

def finalize(mid, objs, extra=None, yaw=-30, pitch=28, margin=0.8, lens=50, gap=0.25, look_z=None, layout=True):
    """Export objs (each at origin) to GLB, then lay out, render preview and save .blend."""
    to_origin(objs)
    bpy.context.view_layer.update()
    export_glb(objs, f'{GLB_DIR}/{mid}.glb')
    if layout and len(objs) > 1:
        spread(objs, gap)
    for o in objs:
        o['farm_export_at_origin'] = True
    shown = objs + (extra or [])
    preview(shown, f'{PNG_DIR}/{mid}.png', yaw=yaw, pitch=pitch, margin=margin, lens=lens, look_z=look_z)
    save_blend(mid)
    print('FINAL', mid, {o.name: tris(o) for o in objs}, 'total', sum(tris(o) for o in objs))

def append_from(mid, names):
    """Append objects from art/farm/blend/<mid>.blend for previews (not exported)."""
    path = f'{BLEND_DIR}/{mid}.blend'
    with bpy.data.libraries.load(path, link=False) as (src, dst):
        dst.objects = [n for n in src.objects if n in names]
    out = []
    for o in dst.objects:
        if o is None:
            continue
        o.name = '_pv_' + o.name
        bpy.context.scene.collection.objects.link(o)
        o.location = (0, 0, 0)
        out.append(o)
    for lib in list(bpy.data.libraries):
        try:
            bpy.data.libraries.remove(lib)
        except Exception:
            pass
    return out

def dup(o, loc, rz=0.0):
    d = o.copy()
    d.name = '_pv_' + o.name
    bpy.context.scene.collection.objects.link(d)
    d.location = loc
    d.rotation_euler = (0, 0, rz)
    return d

def _crystal(self, base, dirv, length, radius, sides=6, tip=0.32, col0=0xc9b6ee, col1=0xfdf2ff, mat='farm_pearl',
             rot=0.0, facet=None, taper=0.85):
    """Faceted prism with a pointed tip. Flat shaded. facet: list of tints per side."""
    base = Vector(base); d = Vector(dirv).normalized()
    q = Vector((0, 0, 1)).rotation_difference(d)
    M = Matrix.Translation(base) @ q.to_matrix().to_4x4() @ Matrix.Rotation(rot, 4, 'Z')
    L0 = length * (1 - tip)
    facet = facet or [0xf6d8f4, 0xd8e6ff, 0xfff4e6, 0xe6dcff, 0xd6f2f4, 0xffe2ee]
    rings = []
    for z, s in ((-0.02 * length, 1.0), (L0, taper)):
        ring = []
        for k in range(sides):
            a = TAU * k / sides
            ring.append(self.bm.verts.new(M @ Vector((math.cos(a) * radius * s, math.sin(a) * radius * s, z))))
        rings.append(ring)
    apex = self.bm.verts.new(M @ Vector((0, 0, length)))
    faces = []
    idx = self.mi(mat)
    for k in range(sides):
        k1 = (k + 1) % sides
        f1 = self.bm.faces.new((rings[0][k], rings[0][k1], rings[1][k1], rings[1][k]))
        f2 = self.bm.faces.new((rings[1][k], rings[1][k1], apex))
        for f, t0, t1 in ((f1, 0.0, 1 - tip), (f2, 1 - tip, 1.0)):
            f.material_index = idx
            f.smooth = False
            tint = facet[k % len(facet)]
            for lp in f.loops:
                lc = M.inverted() @ lp.vert.co
                t = max(0.0, min(1.0, lc.z / length))
                c = mixc(col0, col1, t)
                c = mixc(c, tint, 0.35)
                lp[self.col] = lin(c)
            faces.append(f)
    fb = self.bm.faces.new(list(reversed(rings[0])))
    fb.material_index = idx
    for lp in fb.loops:
        lp[self.col] = lin(mulc(col0, 0.8))
    faces.append(fb)
    self.bm.normal_update()
    return faces

Builder.crystal = _crystal
MATS['farm_pearl'] = (0.16, 0.0, 0.7, False, None, 0.0, 0.0)
MATS['farm_gold'] = (0.24, 0.7, 0.3, False, None, 0.0, 0.0)

def detach():
    """Never touch another task's file: switch the session to our own scratch file first."""
    fp = bpy.data.filepath
    if not fp.startswith(BLEND_DIR) and not fp.startswith(SCR):
        bpy.ops.wm.save_as_mainfile(filepath=SCR + '/_work.blend')
        reset()
        print('detached from', fp)


def rot_mesh_z(ob, ang=math.pi):
    """Rotate mesh data about Z (object stays at origin). Used to turn fronts from -Y to +Y (game yaw=0 looks -Z)."""
    ob.data.transform(Matrix.Rotation(ang, 4, 'Z'))
    ob.data.update()


def attach(ob, name, p):
    """Store an attach point (Blender coords of this object) as glTF extras in game axes (Y up, -Z forward)."""
    ob[name] = [round(p[0], 4), round(p[2], 4), round(-p[1], 4)]


def _mark(self):
    # BMesh reuses freed slots after delete/bisect, so remember the faces themselves, not a count
    return set(self.bm.faces)

def _since(self, m):
    return [f for f in self.bm.faces if f not in m]

Builder.mark = _mark
Builder.since = _since

# ------------------------------------------------------------------ triangle budgets (design-v11 §16)

def fit_tris(ob, target, keep=None):
    """Collapse-decimate a built object down to <= target triangles. Vertex colours / materials are interpolated.
    keep: optional vertex group-free guard = minimum ratio (avoid destroying tiny parts)."""
    n = tris(ob)
    if n <= target:
        return n
    ratio = target / n
    dg = bpy.context.evaluated_depsgraph_get()
    best = None
    vg = None
    pa = ob.data.attributes.get('protect')
    if pa is not None:
        vg = ob.vertex_groups.new(name='_dec')
        vg.add([i for i, a in enumerate(pa.data) if a.value == 0], 1.0, 'REPLACE')
    for attempt in range(5):
        m = ob.modifiers.new('fit', 'DECIMATE')
        m.decimate_type = 'COLLAPSE'
        m.ratio = max(0.05, min(1.0, ratio))
        m.use_collapse_triangulate = True
        if vg:
            m.vertex_group = vg.name
            m.vertex_group_factor = 1000.0
        bpy.context.view_layer.update()
        dg = bpy.context.evaluated_depsgraph_get()
        me = bpy.data.meshes.new_from_object(ob.evaluated_get(dg), preserve_all_data_layers=True, depsgraph=dg)
        ob.modifiers.remove(m)
        k = sum(len(p.vertices) - 2 for p in me.polygons)
        if best:
            bpy.data.meshes.remove(best[0])
        best = (me, k)
        if k <= target:
            break
        ratio *= (target / k) * 0.985
    me, k = best
    if vg:
        ob.vertex_groups.remove(vg)
    if 'protect' in me.attributes:
        me.attributes.remove(me.attributes['protect'])
    old = ob.data
    nm = old.name
    ob.data = me
    bpy.data.meshes.remove(old)
    me.name = nm
    if 'Col' in me.color_attributes:
        me.color_attributes.active_color = me.color_attributes['Col']
        try:
            me.color_attributes.render_color_index = me.color_attributes.find('Col')
        except Exception:
            pass
    print(f'fit {ob.name}: {n} -> {k} (target {target})')
    return k

def fit_all(objs, budgets):
    """budgets: {object name: max tris}."""
    for o in objs:
        if o.name in budgets:
            fit_tris(o, budgets[o.name])
