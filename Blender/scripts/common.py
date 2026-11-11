# common.py - shared helpers for the Guardian city build. exec'd by every script:
#   exec(open('/Users/mac/Documents/Cordon/Blender/scripts/common.py').read(), globals())
import bpy, bmesh, math, random
from math import pi, sin, cos, radians
from mathutils import Vector, Matrix, Euler

PROJ = '/Users/mac/Documents/Cordon/Blender'
STATES = ['normal', 'warning', 'incident', 'recovery']

# ---------------------------------------------------------------- colours / materials
def _lin(c):
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4
def hx(h, a=1.0):
    h = h.lstrip('#')
    return tuple(_lin(int(h[i:i + 2], 16) / 255) for i in (0, 2, 4)) + (a,)

def MAT(name, col='#888888', rough=0.5, metal=0.0, emit=None, es=0.0, alpha=1.0):
    """get-or-create Principled material. emit = hex colour of emission."""
    m = bpy.data.materials.get(name)
    if m:
        return m
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes['Principled BSDF']
    b.inputs['Base Color'].default_value = hx(col)
    b.inputs['Roughness'].default_value = rough
    b.inputs['Metallic'].default_value = metal
    if emit:
        b.inputs['Emission Color'].default_value = hx(emit)
        b.inputs['Emission Strength'].default_value = es
    if alpha < 1.0:
        b.inputs['Alpha'].default_value = alpha
        try: m.surface_render_method = 'BLENDED'
        except Exception: pass
    m.diffuse_color = hx(col)
    return m

def shared_materials():
    MAT('state_warning', '#FFB300', 0.4, 0.0, '#FFB300', 3.0)
    MAT('state_incident', '#FF2D3D', 0.4, 0.0, '#FF1A2E', 4.0)
    MAT('state_recovery', '#5E8FA3', 0.45, 0.1, '#58C8D8', 2.5)
    MAT('state_ok', '#22E08A', 0.4, 0.0, '#22E08A', 3.0)
    MAT('hazard_yellow', '#FFC400', 0.5)
    MAT('hazard_black', '#15171C', 0.6)
    MAT('window_warm', '#FFD27A', 0.3, 0.0, '#FFA94D', 2.2)
    MAT('lamp_glow', '#FFE9A8', 0.3, 0.0, '#FFD479', 6.0)
    MAT('steel', '#9AA6B8', 0.35, 0.85)
    MAT('steel_dark', '#3B4455', 0.4, 0.7)
    MAT('stone_light', '#CFD6E4', 0.7)
    MAT('stone_mid', '#8791A8', 0.75)
    MAT('stone_dark', '#323B52', 0.8)
    MAT('asphalt', '#1A2236', 0.85)
    MAT('screen_dark', '#06121F', 0.2, 0.0, '#0A2A44', 0.6)
    MAT('trunk', '#6B4A32', 0.9)
    MAT('leaf_a', '#2FA84F', 0.8)
    MAT('leaf_b', '#58C25A', 0.8)
    MAT('leaf_dark', '#1F7A3E', 0.85)
    MAT('leaf_pink', '#F59CC8', 0.8)
    MAT('flower_pink', '#FF6FB5', 0.6)
    MAT('flower_yellow', '#FFD84A', 0.6)
    MAT('skin', '#F2C7A0', 0.7)
    MAT('cloth_a', '#E24A6B', 0.8)
    MAT('cloth_b', '#3B82F6', 0.8)
    MAT('cloth_c', '#F5F5F5', 0.8)
    MAT('wood', '#9A6B45', 0.7)
    MAT('white', '#F2F5FA', 0.5)

# ---------------------------------------------------------------- mesh builder
def _scratch_coll():
    c = bpy.data.collections.get('_scratch')
    if not c:
        c = bpy.data.collections.new('_scratch')
        bpy.context.scene.collection.children.link(c)
    return c

MIN_TEXT = 0.9   # city-scale legibility: smaller text panels are dropped

class MB:
    """Accumulates primitives (multi material) into one object. Positions are in building-local coords."""
    def __init__(s, bld, name, par, mats=None, origin=(0, 0, 0)):
        s.bld = bld; s.name = name; s.par = par
        s.bm = bmesh.new()
        s.mats = []
        s.origin = Vector(origin)
        s.stack = [Matrix.Identity(4)]
        s.default = None
        for m in (mats or []):
            s.mi(m)
        bld.open.append(s)
        _t = type(s).text
        s.text = (lambda txt, size, *a, _t=_t, **k: _t(s, txt, size, *a, **k) if size >= MIN_TEXT else None)

    def mi(s, m):
        if m is None:
            m = s.default or (s.mats[0] if s.mats else 'white')
        if isinstance(m, bpy.types.Material):
            m = m.name
        if m not in s.mats:
            s.mats.append(m)
        return s.mats.index(m)

    # transform stack (face frames)
    def push(s, pos=(0, 0, 0), rot=(0, 0, 0)):
        s.stack.append(s.stack[-1] @ Matrix.Translation(pos) @ Euler(rot, 'XYZ').to_matrix().to_4x4())
        return s
    def pop(s):
        s.stack.pop()

    def _m(s, pos, rot, scale=(1, 1, 1)):
        return s.stack[-1] @ Matrix.Translation(pos) @ Euler(rot, 'XYZ').to_matrix().to_4x4() @ Matrix.Diagonal((scale[0], scale[1], scale[2], 1))

    def _begin(s):
        return set(s.bm.faces)
    def _end(s, n0, m, smooth=False):
        i = s.mi(m)
        for f in s.bm.faces:
            if f not in n0:
                f.material_index = i
                f.smooth = smooth

    def _bev(s, verts, bev, seg):
        if bev and bev > 0:
            edges = list({e for v in verts for e in v.link_edges})
            bmesh.ops.bevel(s.bm, geom=edges, offset=bev, offset_type='OFFSET', segments=seg, profile=0.5, affect='EDGES')

    # ---- primitives
    def box(s, size, pos, m=None, rot=(0, 0, 0), bev=0.0, seg=2, base=False):
        sx, sy, sz = size
        p = Vector(pos)
        if base: p.z += sz / 2
        bev = min(bev, min(sx, sy, sz) * 0.45)
        n0 = s._begin()
        r = bmesh.ops.create_cube(s.bm, size=1.0, matrix=s._m(p, rot, (sx, sy, sz)))
        s._bev(r['verts'], bev, seg)
        s._end(n0, m)

    def cyl(s, r, h, pos, m=None, rot=(0, 0, 0), verts=16, r2=None, base=True, bev=0.0, smooth=False, cap=True):
        p = Vector(pos)
        if base: p.z += h / 2
        n0 = s._begin()
        r2_ = r if r2 is None else r2
        res = bmesh.ops.create_cone(s.bm, cap_ends=cap, cap_tris=False, segments=verts, radius1=r, radius2=r2_, depth=h, matrix=s._m(p, rot))
        s._bev(res['verts'], bev, 1)
        s._end(n0, m, smooth)

    def sphere(s, r, pos, m=None, scale=(1, 1, 1), sub=2, smooth=True):
        n0 = s._begin()
        bmesh.ops.create_icosphere(s.bm, subdivisions=sub, radius=r, matrix=s._m(pos, (0, 0, 0), scale))
        s._end(n0, m, smooth)

    def uvsphere(s, r, pos, m=None, scale=(1, 1, 1), u=16, v=10, smooth=True):
        n0 = s._begin()
        bmesh.ops.create_uvsphere(s.bm, u_segments=u, v_segments=v, radius=r, matrix=s._m(pos, (0, 0, 0), scale))
        s._end(n0, m, smooth)

    def ring(s, ro, ri, h, pos, m=None, rot=(0, 0, 0), seg=48, arc=2 * pi, a0=0.0, smooth=False):
        """flat annulus (axis = local Z), arc segment optional."""
        M = s._m(pos, rot)
        n0 = s._begin()
        full = abs(arc - 2 * pi) < 1e-6
        steps = seg if full else max(2, int(seg * arc / (2 * pi)) + 1)
        rows = []
        for i in range(steps + (0 if full else 1)):
            a = a0 + arc * i / steps
            c, sn = cos(a), sin(a)
            rows.append([s.bm.verts.new(M @ Vector((c * ro, sn * ro, h / 2))), s.bm.verts.new(M @ Vector((c * ri, sn * ri, h / 2))),
                         s.bm.verts.new(M @ Vector((c * ri, sn * ri, -h / 2))), s.bm.verts.new(M @ Vector((c * ro, sn * ro, -h / 2)))])
        n = len(rows)
        for i in range(n if full else n - 1):
            a, b = rows[i], rows[(i + 1) % n]
            # outer, top, inner, bottom
            s.bm.faces.new((a[3], b[3], b[0], a[0]))   # outer
            s.bm.faces.new((a[0], b[0], b[1], a[1]))   # top
            s.bm.faces.new((a[1], b[1], b[2], a[2]))   # inner
            s.bm.faces.new((a[2], b[2], b[3], a[3]))   # bottom
        if not full:
            for r_, flip in ((rows[0], False), (rows[-1], True)):
                q = (r_[0], r_[1], r_[2], r_[3])
                s.bm.faces.new(q[::-1] if flip else q)
        fs = [f for f in s.bm.faces if f not in n0]
        bmesh.ops.recalc_face_normals(s.bm, faces=fs)
        s._end(n0, m, smooth)

    def prism(s, pts, thick, pos, m=None, rot=(0, 0, 0), scale=1.0):
        """polygon in local XZ plane (x,z), extruded along Y by thick (centered)."""
        M = s._m(pos, rot)
        n0 = s._begin()
        vs = [s.bm.verts.new(M @ Vector((x * scale, -thick / 2, z * scale))) for x, z in pts]
        f = s.bm.faces.new(vs)
        res = bmesh.ops.extrude_face_region(s.bm, geom=[f])
        nv = [e for e in res['geom'] if isinstance(e, bmesh.types.BMVert)]
        bmesh.ops.translate(s.bm, vec=M.to_3x3() @ Vector((0, thick, 0)), verts=nv)
        bmesh.ops.recalc_face_normals(s.bm, faces=[f for f in s.bm.faces if f not in n0])
        s._end(n0, m)

    def text(s, txt, size, pos, m=None, rot=(pi / 2, 0, 0), depth=0.05, align='CENTER', bold=False):
        cu = bpy.data.curves.new('_t', 'FONT')
        cu.body = txt; cu.size = size; cu.extrude = depth / 2; cu.align_x = align; cu.align_y = 'CENTER'
        cu.resolution_u = 3
        if bold: cu.offset = 0.02
        ob = bpy.data.objects.new('_t', cu)
        _scratch_coll().objects.link(ob)
        bpy.context.view_layer.update()
        dg = bpy.context.evaluated_depsgraph_get()
        me = bpy.data.meshes.new_from_object(ob.evaluated_get(dg))
        me.transform(s._m(pos, rot))
        n0 = s._begin()
        s.bm.from_mesh(me)
        s._end(n0, m)
        bpy.data.meshes.remove(me); bpy.data.objects.remove(ob); bpy.data.curves.remove(cu)

    # ---- finish
    def done(s):
        if s.bm is None: return None
        bm = s.bm
        if not bm.faces:
            bm.free(); s.bm = None
            return None
        bmesh.ops.triangulate(bm, faces=bm.faces[:])
        bmesh.ops.translate(bm, vec=-s.origin, verts=bm.verts[:])
        me = bpy.data.meshes.new(s.name)
        bm.to_mesh(me); bm.free(); s.bm = None
        for n in s.mats:
            me.materials.append(bpy.data.materials[n])
        ob = bpy.data.objects.new(s.name, me)
        s.bld.coll.objects.link(ob)
        ob.parent = s.par
        ob.location = s.origin
        s.obj = ob
        return ob

# ---------------------------------------------------------------- building container
def purge(code):
    for o in list(bpy.data.objects):
        if o.name == code or o.name.startswith(code + '_') or o.name.startswith(code + '.'):
            bpy.data.objects.remove(o, do_unlink=True)
    c = bpy.data.collections.get(code)
    if c:
        bpy.data.collections.remove(c)
    for me in list(bpy.data.meshes):
        if me.users == 0:
            bpy.data.meshes.remove(me)

def tris(ob):
    me = ob.data
    return sum(len(p.vertices) - 2 for p in me.polygons) if ob.type == 'MESH' else 0

def mk_empty(name, loc, par, coll, size=1.0, kind='PLAIN_AXES'):
    e = bpy.data.objects.new(name, None)
    e.empty_display_type = kind; e.empty_display_size = size
    coll.objects.link(e)
    e.parent = par
    e.location = loc
    return e

class Bld:
    def __init__(s, code, name_vi, size_txt, hotspot_z):
        shared_materials()
        purge(code)
        s.code = code
        s.coll = bpy.data.collections.new(code)
        bpy.context.scene.collection.children.link(s.coll)
        s.root = mk_empty(code, (0, 0, 0), None, s.coll, 2.0, 'ARROWS')
        s.root['name_vi'] = name_vi; s.root['size'] = size_txt; s.root['code'] = code
        s.st = {st: mk_empty(f'{code}_state_{st}', (0, 0, 0), s.root, s.coll, 1.0) for st in STATES}
        s.hotspot = mk_empty(f'{code}_hotspot', (0, 0, hotspot_z), s.root, s.coll, 1.0, 'SPHERE')
        s.open = []
    def part(s, suffix, mats=None, origin=(0, 0, 0)):
        return MB(s, f'{s.code}_{suffix}', s.root, mats, origin)
    def sp(s, state, suffix, mats=None, origin=(0, 0, 0)):
        return MB(s, f'{s.code}_state_{state}_{suffix}', s.st[state], mats, origin)
    def finish(s):
        for mb in s.open:
            mb.done()
        s.open = []
        apply_night_contract(s.coll)
        total = 0
        for o in s.coll.all_objects:
            total += tris(o)
        s.tris = total
        return total


# ---------------------------------------------------------------- night / state contract (web boosts these by material-name substring)
#   window*   -> warm emissive panes (modest 1.0; web: ~0 by day, boosted at night)
#   lamp*     -> street/park lamp heads (3.0)
#   carlight* -> car head / tail lights
#   *_glow    -> neon accents (unchanged)
#   *_tint objects (translucent state shells) are removed from every building (web uses outline glows)
def _set_emit(m, strength, color=None):
    b = m.node_tree.nodes.get('Principled BSDF') if m.use_nodes else None
    if not b: return
    if color: b.inputs['Emission Color'].default_value = hx(color)
    b.inputs['Emission Strength'].default_value = strength

def apply_night_contract(coll):
    for o in list(coll.all_objects):
        if 'tint' in o.name.lower():
            me = o.data
            bpy.data.objects.remove(o, do_unlink=True)
            if me and me.users == 0: bpy.data.meshes.remove(me)
    for m in bpy.data.materials:
        n = m.name.lower()
        if 'tint' in n and m.users == 0: continue
        if 'window' in n and m.use_nodes: _set_emit(m, 1.0)
        elif 'lamp' in n and 'post' not in n and m.use_nodes: _set_emit(m, 3.0)

# ---------------------------------------------------------------- shared detail builders (all take an MB)
def stairs(mb, w, steps, run, rise, pos, m, z0=0.0, bev=0.03, x_off=0.0):
    """steps descend toward -Y. pos = (x, y_back_edge, z_top_of_first_step)."""
    x, y, z = pos
    for i in range(steps):
        top = z - rise * i
        h = top - z0
        mb.box((w, run, h), (x, y - run * (i + 0.5), z0 + h / 2), m, bev=bev, seg=1)

def column(mb, pos, r, h, m, m_cap=None, verts=14, flutes=False):
    x, y, z = pos
    m_cap = m_cap or m
    mb.box((r * 2.9, r * 2.9, r * 0.45), (x, y, z), m_cap, base=True, bev=0.03)
    mb.cyl(r, h - r * 0.9, (x, y, z + r * 0.45), m, verts=verts, smooth=False)
    mb.box((r * 2.9, r * 2.9, r * 0.45), (x, y, z + h - r * 0.45), m_cap, base=True, bev=0.03)

def window(mb, u, z, w, h, d, rz=0.0, cols=2, rows=2, mf='white', mg='window_warm', c=(0, 0), t=0.22, proud=0.1):
    """window on a facade. face frame: front=-Y (rz=0), d = wall distance from origin."""
    mb.push((c[0], c[1], 0), (0, 0, rz))
    y = -(d + proud * 0.5)
    ft = 0.16
    mb.box((w, 0.16, h), (u, -(d + 0.05), z), mg)                      # glowing pane
    for dx in (-1, 1):
        mb.box((ft, t, h + ft), (u + dx * (w / 2), y, z), mf, bev=0.025, seg=1)
    for dz in (-1, 1):
        mb.box((w + ft, t, ft), (u, y, z + dz * (h / 2)), mf, bev=0.025, seg=1)
    for i in range(1, cols):
        mb.box((0.08, t * 0.7, h), (u - w / 2 + w * i / cols, y, z), mf)
    for j in range(1, rows):
        mb.box((w, t * 0.7, 0.08), (u, y, z - h / 2 + h * j / rows), mf)
    mb.box((w + 0.5, t + 0.12, 0.14), (u, y - 0.04, z - h / 2 - 0.12), mf, bev=0.03, seg=1)   # sill
    mb.pop()

def tree(mt, ml, pos, s=1.0, kind=0, leaf=('leaf_a', 'leaf_b')):
    x, y, z = pos
    mt.cyl(0.22 * s, 1.5 * s, (x, y, z), 'trunk', verts=6)
    if kind == 0:   # round
        ml.sphere(1.25 * s, (x, y, z + 2.2 * s), leaf[0], sub=1, scale=(1, 1, 0.9))
        ml.sphere(0.85 * s, (x + 0.7 * s, y + 0.2 * s, z + 3.0 * s), leaf[1], sub=1)
        ml.sphere(0.7 * s, (x - 0.7 * s, y - 0.3 * s, z + 2.9 * s), leaf[1], sub=1)
    elif kind == 1:  # cone pine
        for i in range(3):
            ml.cyl(1.2 * s - i * 0.3 * s, 1.3 * s, (x, y, z + (1.2 + i * 0.85) * s), 'leaf_dark', r2=0.05, verts=8)
    else:           # pink blossom
        ml.sphere(1.2 * s, (x, y, z + 2.2 * s), 'leaf_pink', sub=1, scale=(1, 1, 0.85))
        ml.sphere(0.8 * s, (x + 0.8 * s, y, z + 2.9 * s), 'flower_pink', sub=1)

def lamp(mb, pos, h=3.2, glow='lamp_glow', m_post='steel_dark'):
    x, y, z = pos
    mb.cyl(0.35, 0.3, (x, y, z), m_post, verts=8)
    mb.cyl(0.09, h, (x, y, z), m_post, verts=6)
    mb.box((0.32, 0.32, 0.5), (x, y, z + h + 0.1), glow, bev=0.03, seg=1)
    mb.cyl(0.28, 0.12, (x, y, z + h + 0.38), m_post, verts=6, r2=0.05)

def bench(mb, pos, rz=0, m='wood'):
    x, y, z = pos
    mb.push((x, y, z), (0, 0, rz))
    mb.box((1.8, 0.5, 0.1), (0, 0, 0.45), m, bev=0.02, seg=1)
    mb.box((1.8, 0.1, 0.45), (0, 0.22, 0.8), m, rot=(0.2, 0, 0))
    for dx in (-0.8, 0.8):
        mb.box((0.1, 0.45, 0.45), (dx, 0, 0.22), 'steel_dark')
    mb.pop()

def person(mb, pos, rz=0, cloth='cloth_a', s=1.0):
    return  # NO PEOPLE anywhere (product decision)
    x, y, z = pos
    mb.push((x, y, z), (0, 0, rz))
    mb.cyl(0.2 * s, 0.7 * s, (0, 0, 0.0), 'cloth_c', verts=6)
    mb.cyl(0.26 * s, 0.75 * s, (0, 0, 0.7 * s), cloth, r2=0.2 * s, verts=8)
    mb.sphere(0.2 * s, (0, 0, 1.65 * s), 'skin', sub=1)
    mb.pop()

def hazard_bar(mb, p0, p1, z=1.0, h=0.5, thick=0.22, nstripe=8):
    """striped hazard bar from p0 to p1 (xy), yellow with black stripes."""
    a, b = Vector((p0[0], p0[1], 0)), Vector((p1[0], p1[1], 0))
    d = b - a; L = d.length; ang = math.atan2(d.y, d.x); c = (a + b) / 2
    mb.push((c.x, c.y, z), (0, 0, ang))
    mb.box((L, thick, h), (0, 0, 0), 'hazard_yellow', bev=0.03, seg=1)
    sl = L / (nstripe * 2)
    for i in range(nstripe):
        mb.box((sl, thick + 0.02, h + 0.01), (-L / 2 + sl * (2 * i + 1.5), 0, 0), 'hazard_black', rot=(0, 0, 0))
    mb.pop()

# ---- icons (drawn on the local XZ plane facing -Y; pos = centre; k = scale)
SHIELD = [(0, .56), (.32, .48), (.46, .38), (.46, .02), (.32, -.28), (0, -.56), (-.32, -.28), (-.46, .02), (-.46, .38), (-.32, .48)]
def icon_shield(mb, pos, k, m_out, m_in=None, th=0.14, rot=(0, 0, 0)):
    mb.prism(SHIELD, th, pos, m_out, rot, k)
    if m_in:
        mb.prism(SHIELD, th * 0.6, (pos[0], pos[1] - th * 0.6, pos[2]), m_in, rot, k * 0.78)

def icon_check(mb, pos, k, m, th=0.12):
    x, y, z = pos
    mb.box((0.28 * k, th, 0.08 * k), (x - 0.12 * k, y, z - 0.04 * k), m, rot=(0, -0.78, 0))
    mb.box((0.5 * k, th, 0.08 * k), (x + 0.1 * k, y, z + 0.06 * k), m, rot=(0, 0.78, 0))

def icon_x(mb, pos, k, m, th=0.12):
    x, y, z = pos
    for a in (0.785, -0.785):
        mb.box((0.9 * k, th, 0.16 * k), (x, y, z), m, rot=(0, a, 0), bev=0.02, seg=1)

def icon_warn(mb, pos, k, m_tri, m_glyph='hazard_black', th=0.14):
    x, y, z = pos
    mb.prism([(0, .5), (.5, -.38), (-.5, -.38)], th, pos, m_tri, scale=k)
    mb.box((0.1 * k, th * 1.3, 0.34 * k), (x, y - 0.02, z - 0.02 * k), m_glyph)
    mb.box((0.1 * k, th * 1.3, 0.1 * k), (x, y - 0.02, z - 0.27 * k), m_glyph)

def icon_lock(mb, pos, k, m, m_dark='hazard_black', th=0.14):
    x, y, z = pos
    mb.box((0.62 * k, th, 0.46 * k), (x, y, z - 0.12 * k), m, bev=0.03, seg=1)
    for dx in (-0.2, 0.2):
        mb.box((0.1 * k, th, 0.3 * k), (x + dx * k, y, z + 0.2 * k), m)
    mb.box((0.5 * k, th, 0.1 * k), (x, y, z + 0.36 * k), m)
    mb.cyl(0.07 * k, th * 1.2, (x, y - 0.01, z - 0.1 * k), m_dark, rot=(pi / 2, 0, 0), verts=8, base=False)

def icon_pause(mb, pos, k, m, th=0.14):
    x, y, z = pos
    for dx in (-0.16, 0.16):
        mb.box((0.18 * k, th, 0.7 * k), (x + dx * k, y, z), m, bev=0.02, seg=1)

def icon_refresh(mb, pos, k, m, th=0.14):
    x, y, z = pos
    mb.ring(0.4 * k, 0.28 * k, th, pos, m, rot=(pi / 2, 0, 0), seg=40, arc=pi * 1.5, a0=0.4)
    mb.prism([(0, .0), (.22, .0), (.11, -.2)], th, (x + 0.34 * k * cos(0.4 + pi * 1.5) * 1.0, y, z + 0.34 * k * sin(0.4 + pi * 1.5) * 1.0), m, scale=k * 1.3)

def icon_leaf(mb, pos, k, m, m_vein=None, th=0.14):
    pts = [(0, .6), (.28, .38), (.4, .02), (.28, -.34), (0, -.52), (-.28, -.34), (-.4, .02), (-.28, .38)]
    mb.prism(pts, th, pos, m, (0, 0.5, 0), k)
    if m_vein:
        mb.box((0.06 * k, th * 1.3, 0.9 * k), (pos[0], pos[1] - 0.02, pos[2] - 0.02), m_vein, rot=(0, 0.5, 0))

def icon_chart_up(mb, pos, k, m_bar, m_arrow, th=0.14):
    x, y, z = pos
    for i, hh in enumerate((0.25, 0.4, 0.58)):
        mb.box((0.16 * k, th, hh * k), (x + (i - 1) * 0.24 * k, y, z - 0.35 * k + hh * k / 2), m_bar, bev=0.015, seg=1)
    mb.box((0.9 * k, th, 0.07 * k), (x - 0.05 * k, y - 0.02, z + 0.12 * k), m_arrow, rot=(0, 0.55, 0))
    mb.prism([(0, .12), (.18, -.06), (-.06, -.1)], th, (x + 0.38 * k, y - 0.02, z + 0.34 * k), m_arrow, scale=k * 1.4, rot=(0, -0.5, 0))

def icon_scales(mb, pos, k, m, th=0.12):
    x, y, z = pos
    mb.box((0.06 * k, th, 0.9 * k), (x, y, z), m)
    mb.box((0.9 * k, th, 0.06 * k), (x, y, z + 0.4 * k), m)
    mb.box((0.28 * k, th, 0.06 * k), (x, y, z - 0.46 * k), m)
    for dx in (-0.42, 0.42):
        mb.box((0.02 * k, th * 0.6, 0.38 * k), (x + dx * k, y, z + 0.22 * k), m, rot=(0, 0.35, 0))
        mb.box((0.02 * k, th * 0.6, 0.38 * k), (x + dx * k, y, z + 0.22 * k), m, rot=(0, -0.35, 0))
        mb.cyl(0.2 * k, 0.06 * k, (x + dx * k, y, z + 0.0 * k), m, rot=(pi / 2, 0, 0), verts=14, base=False, r2=0.2 * k)

def icon_cart(mb, pos, k, m, th=0.12):
    x, y, z = pos
    mb.prism([(-.42, .25), (.42, .25), (.32, -.12), (-.32, -.12)], th, (x, y, z + 0.02 * k), m, scale=k)
    mb.box((0.3 * k, th, 0.07 * k), (x - 0.5 * k, y, z + 0.32 * k), m, rot=(0, 0.5, 0))
    mb.box((0.18 * k, th, 0.07 * k), (x - 0.38 * k, y, z + 0.36 * k), m)
    for dx in (-0.2, 0.2):
        mb.cyl(0.06 * k, th, (x + dx * k, y, z - 0.25 * k), m, rot=(pi / 2, 0, 0), verts=8, base=False)

def icon_book(mb, pos, k, m, m_page, th=0.12):
    x, y, z = pos
    for sgn in (-1, 1):
        mb.prism([(0, .4), (sgn * .46, .34), (sgn * .46, -.34), (0, -.3)], th, (x, y, z), m, scale=k)
        mb.prism([(sgn * .04, .34), (sgn * .4, .29), (sgn * .4, -.28), (sgn * .04, -.25)], th * 0.5, (x, y - th * 0.55, z), m_page, scale=k)

def icon_hourglass(mb, pos, k, m, th=0.12):
    x, y, z = pos
    mb.prism([(-.3, .5), (.3, .5), (0.04, 0), (.3, -.5), (-.3, -.5), (-0.04, 0)], th, pos, m, scale=k)
    mb.box((0.7 * k, th, 0.08 * k), (x, y, z + 0.52 * k), m)
    mb.box((0.7 * k, th, 0.08 * k), (x, y, z - 0.52 * k), m)

def progress_bar(bld, state, name, pos, w, h, frac, m_track='steel_dark', m_fill='state_recovery', depth=0.18, rz=0.0):
    """two separate objects: ..._track and ..._fill (fill origin at left end so web can scale X)."""
    x, y, z = pos
    t = bld.sp(state, f'{name}_track', [m_track])
    t.push((x, y, z), (0, 0, rz)); t.box((w, depth, h), (0, 0, 0), m_track, bev=h * 0.3, seg=2); t.pop()
    # origin at left end of the fill, in world frame
    ox = Vector((x, y, z)) + Matrix.Rotation(rz, 3, 'Z') @ Vector((-w / 2 + h * 0.15, 0, 0))
    f = bld.sp(state, f'{name}_fill', [m_fill], origin=ox)
    f.push((x, y, z), (0, 0, rz))
    fw = (w - h * 0.3) * frac
    f.box((fw, depth * 1.2, h * 0.7), (-w / 2 + h * 0.15 + fw / 2, -0.01, 0), m_fill, bev=h * 0.2, seg=2)
    f.pop()

def panel(mb, pos, w, h, m_frame, m_screen='screen_dark', rot=(0, 0, 0), depth=0.18, bev=0.04):
    mb.push(pos, rot)
    mb.box((w, depth, h), (0, 0, 0), m_frame, bev=bev, seg=2)
    mb.box((w - 0.3, depth * 0.5, h - 0.3), (0, -depth * 0.35, 0), m_screen)
    mb.pop()

def beacon(bld, state, name, pos, r, m_glow, m_base='steel_dark'):
    b = bld.sp(state, f'{name}_base', [m_base]); b.cyl(r * 1.25, r * 0.5, pos, m_base, verts=12, bev=0.03)
    d = bld.sp(state, name, [m_glow], origin=(pos[0], pos[1], pos[2] + r * 0.5))
    d.uvsphere(r, (pos[0], pos[1], pos[2] + r * 0.5), m_glow, scale=(1, 1, 1.1), u=12, v=8)
    return d

def glow_ring(bld, state, name, pos, ro, ri, m, h=0.12, seg=48, rot=(0, 0, 0)):
    r = bld.sp(state, name, [m], origin=pos)
    r.ring(ro, ri, h, pos, m, seg=seg, rot=rot)

# ---------------------------------------------------------------- preview / render
def setup_glow(strength=0.35, threshold=1.0, size=7):
    sc = bpy.context.scene
    try:
        ng = bpy.data.node_groups.get('GlowComp') or bpy.data.node_groups.new('GlowComp', 'CompositorNodeTree')
        ng.nodes.clear()
        try: ng.interface.clear()
        except Exception: pass
        ng.interface.new_socket('Image', in_out='OUTPUT', socket_type='NodeSocketColor')
        rl = ng.nodes.new('CompositorNodeRLayers'); gl = ng.nodes.new('CompositorNodeGlare'); out = ng.nodes.new('NodeGroupOutput')
        for k, v in (('Type', 'Bloom'), ('Threshold', threshold), ('Strength', strength), ('Size', size), ('Quality', 'High')):
            try: gl.inputs[k].default_value = v
            except Exception as e: print('glare', k, e)
        ng.links.new(rl.outputs['Image'], gl.inputs['Image'])
        ng.links.new(gl.outputs['Image'], out.inputs['Image'])
        sc.compositing_node_group = ng
    except Exception as e:
        print('glow setup failed', e)

def preview_setup(size=(1200, 900), samples=48):
    sc = bpy.context.scene
    try: sc.render.engine = 'BLENDER_EEVEE'
    except Exception: sc.render.engine = 'BLENDER_EEVEE_NEXT'
    sc.render.resolution_x, sc.render.resolution_y = size
    sc.render.resolution_percentage = 100
    sc.render.image_settings.file_format = 'PNG'
    try: sc.eevee.taa_render_samples = samples
    except Exception: pass
    try: sc.view_settings.view_transform = 'Standard'; sc.view_settings.look = 'None'
    except Exception: pass
    try: sc.eevee.use_fast_gi = True
    except Exception: pass
    setup_glow()
    pc = bpy.data.collections.get('_preview')
    if not pc:
        pc = bpy.data.collections.new('_preview'); sc.collection.children.link(pc)
    return pc

def preview_rig(center, dist, elev=35, az=-45, lens=50, height=0):
    pc = preview_setup()
    for o in list(pc.objects):
        bpy.data.objects.remove(o, do_unlink=True)
    sc = bpy.context.scene
    cam_d = bpy.data.cameras.new('_pcam'); cam_d.lens = lens
    cam = bpy.data.objects.new('_pcam', cam_d); pc.objects.link(cam)
    e, a = radians(elev), radians(az)
    c = Vector(center)
    cam.location = c + Vector((-sin(a) * cos(e), -cos(a) * cos(e), sin(e))) * dist
    d = c - cam.location
    cam.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler()
    sc.camera = cam
    for nm, en, rot, col in (('_sun', 3.2, (radians(48), radians(8), radians(-35)), (1.0, 0.92, 0.85)),
                              ('_fill', 1.1, (radians(60), 0, radians(145)), (0.55, 0.7, 1.0))):
        ld = bpy.data.lights.new(nm, 'SUN'); ld.energy = en; ld.color = col
        lo = bpy.data.objects.new(nm, ld); pc.objects.link(lo); lo.rotation_euler = rot
    return cam

def only_visible(codes):
    """exclude every building collection not in codes (for isolated preview)."""
    for lc in bpy.context.view_layer.layer_collection.children:
        if lc.name in ('city',) or (len(lc.name) == 3 and lc.name[0] == 'B' and lc.name[1:].isdigit()):
            lc.exclude = lc.name not in codes
def all_visible():
    for lc in bpy.context.view_layer.layer_collection.children:
        lc.exclude = False

def show_state(code, state):
    """normal-state props visible by default; for preview only show the requested state's props."""
    for st in STATES:
        e = bpy.data.objects[f'{code}_state_{st}']
        for ch in e.children_recursive:
            ch.hide_render = (st != state); ch.hide_viewport = (st != state)
def reset_state_visibility(code):
    for st in STATES:
        e = bpy.data.objects[f'{code}_state_{st}']
        for ch in e.children_recursive:
            ch.hide_render = False; ch.hide_viewport = False

def preview_floor(center, r=30):
    pc = bpy.data.collections.get('_preview') or preview_setup()
    old = bpy.data.objects.get('_pfloor')
    if old: bpy.data.objects.remove(old, do_unlink=True)
    me = bpy.data.meshes.new('_pfloor')
    bm = bmesh.new(); bmesh.ops.create_circle(bm, cap_ends=True, segments=64, radius=r, matrix=Matrix.Translation((center[0], center[1], -0.02))); bm.to_mesh(me); bm.free()
    ob = bpy.data.objects.new('_pfloor', me); pc.objects.link(ob)
    ob.data.materials.append(MAT('preview_floor', '#0B1A3A', 0.6, 0.1))

def render_to(path, size=(1200, 900)):
    sc = bpy.context.scene
    sc.render.resolution_x, sc.render.resolution_y = size
    sc.render.filepath = path
    bpy.ops.render.render(write_still=True)

def preview_building(code, center_z=6.0, dist=60, states=('normal',), size=(1200, 900), az=-40, elev=32, lens=50, floor_r=30, tag=None):
    only_visible({code})
    root = bpy.data.objects[code]
    preview_floor(root.matrix_world.translation, floor_r)
    c = root.matrix_world.translation + Vector((0, 0, center_z))
    preview_rig(c, dist, elev, az, lens)
    for st in states:
        show_state(code, st)
        name = f'{code}' if (st == 'normal' and tag is None) else f'{code}_{st}'
        render_to(f'{PROJ}/previews/{name}.png', size)
    reset_state_visibility(code)
    all_visible()


# =====================================================================================
# CARTOON PRESET (added; existing API unchanged). Toy-like isometric diorama like REF_07/REF_08.
# =====================================================================================
CBEV = 0.35          # chunky bevel
CSEG = 3

def CMAT(name, col, emit=None, es=0.0, rough=0.7, alpha=1.0):
    """matte cartoon material (roughness ~0.7, metallic 0)."""
    return MAT(name, col, rough, 0.0, emit, es, alpha)

def cartoon_materials():
    CMAT('c_lawn', '#59B94A'); CMAT('c_lawn_dark', '#3E9A3F'); CMAT('c_curb', '#D4D0EA'); CMAT('c_sidewalk', '#A9A3CF')
    CMAT('c_paver', '#8E88BA'); CMAT('c_road', '#4A4E7A'); CMAT('c_roadline', '#F4F1FF')
    CMAT('c_leaf_a', '#3FAE46'); CMAT('c_leaf_b', '#67C94D'); CMAT('c_leaf_c', '#2E8F4A'); CMAT('c_leaf_pink', '#F49AC6')
    CMAT('c_trunk', '#7A5236'); CMAT('c_bush', '#4CB24A')
    CMAT('c_pole_post', '#2C2A52'); CMAT('c_lamp_glow', '#FFE08A', '#FFC95A', 4.0)
    CMAT('c_bench', '#B3774A'); CMAT('c_shirt_a', '#E85D75'); CMAT('c_shirt_b', '#3C82F6'); CMAT('c_shirt_c', '#F6C945'); CMAT('c_shirt_d', '#4CC38A')
    CMAT('c_pants', '#2D3350'); CMAT('c_skin', '#F2C7A0'); CMAT('c_hair', '#3A2A22'); CMAT('c_vest', '#E4E84A', '#E4E84A', 0.6)
    CMAT('c_water', '#1E4FC4', '#1E5FE0', 0.5, 0.15)

def cbox(mb, size, pos, m=None, rot=(0, 0, 0), bev=None, base=False, seg=None):
    """chunky rounded box."""
    mb.box(size, pos, m, rot, CBEV if bev is None else bev, CSEG if seg is None else seg, base)

def rtree(mt, ml, pos, s=1.0, kind=0, leaf=('c_leaf_a', 'c_leaf_b', 'c_leaf_c'), trunk='c_trunk'):
    """round cartoon tree: tapered trunk + 3 overlapping smooth balls (kind 0 green, 1 pine/cone, 2 pink blossom)."""
    x, y, z = pos
    mt.cyl(0.38 * s, 1.8 * s, (x, y, z), trunk, r2=0.26 * s, verts=8, smooth=True)
    if kind == 1:
        for i in range(3):
            ml.cyl(1.7 * s - i * 0.45 * s, 1.7 * s, (x, y, z + (1.2 + i * 1.0) * s), leaf[2], r2=0.12 * s, verts=10, smooth=True)
        return
    a, b_, c = (('c_leaf_pink', 'c_leaf_pink', 'flower_pink') if kind == 2 else leaf)
    ml.sphere(1.7 * s, (x, y, z + 2.9 * s), a, sub=2, scale=(1, 1, 0.95))
    ml.sphere(1.25 * s, (x + 1.0 * s, y + 0.3 * s, z + 3.6 * s), b_, sub=2)
    ml.sphere(1.15 * s, (x - 0.9 * s, y - 0.4 * s, z + 3.5 * s), c, sub=2)

def clamp_post(mb, pos, h=3.6):
    x, y, z = pos
    mb.cyl(0.42, 0.45, (x, y, z), 'c_pole_post', verts=10, bev=0.05, r2=0.3)
    mb.cyl(0.14, h, (x, y, z), 'c_pole_post', verts=8)
    mb.box((0.62, 0.62, 0.85), (x, y, z + h + 0.15), 'c_lamp_glow', bev=0.15, seg=2)
    mb.box((0.8, 0.8, 0.18), (x, y, z + h + 0.62), 'c_pole_post', bev=0.05, seg=1)

def cperson(mb, pos, rz=0.0, shirt='c_shirt_a', s=1.0, hair='c_hair', vest=False):
    return  # NO PEOPLE anywhere (product decision)
    """chunky toy person ~1.8m tall."""
    x, y, z = pos
    s = s * 1.3
    mb.push((x, y, z), (0, 0, rz))
    for dx in (-0.14, 0.14):
        mb.cyl(0.13 * s, 0.75 * s, (dx * s, 0, 0), 'c_pants', verts=6)
    mb.box((0.52 * s, 0.32 * s, 0.7 * s), (0, 0, 0.72 * s), 'c_vest' if vest else shirt, bev=0.08 * s, seg=2)
    for dx in (-0.34, 0.34):
        mb.box((0.14 * s, 0.14 * s, 0.55 * s), (dx * s, 0, 0.82 * s), shirt, bev=0.04)
    mb.sphere(0.24 * s, (0, 0, 1.72 * s), 'c_skin', sub=2)
    mb.sphere(0.25 * s, (0, 0.04 * s, 1.78 * s), hair, sub=1, scale=(1, 1, 0.8))
    mb.pop()

def cbench(mb, pos, rz=0.0):
    x, y, z = pos
    mb.push((x, y, z), (0, 0, rz))
    mb.box((2.0, 0.65, 0.18), (0, 0, 0.5), 'c_bench', bev=0.05, seg=2)
    mb.box((2.0, 0.14, 0.55), (0, 0.28, 0.85), 'c_bench', bev=0.05, seg=2)
    for dx in (-0.8, 0.8):
        mb.box((0.18, 0.55, 0.5), (dx, 0, 0), 'c_pole_post', base=True)
    mb.pop()

def cplot(mb, cx, cy, w, d, z=0.0, curb=0.9, m_lawn='c_lawn', walk=2.2):
    """rounded plot: light curb ring + sidewalk + lawn, top of lawn at z+0.5."""
    mb.box((w, d, 0.6), (cx, cy, z), 'c_curb', base=True, bev=0.3, seg=3)
    mb.box((w - curb * 2, d - curb * 2, 0.3), (cx, cy, z + 0.6), 'c_sidewalk', base=True, bev=0.12, seg=2)
    mb.box((w - curb * 2 - walk * 2, d - curb * 2 - walk * 2, 0.3), (cx, cy, z + 0.85), m_lawn, base=True, bev=0.12, seg=2)

def setup_cartoon_world():
    w = bpy.data.worlds.get('CartoonWorld') or bpy.data.worlds.new('CartoonWorld')
    w.use_nodes = True
    nt = w.node_tree; nt.nodes.clear()
    tc = nt.nodes.new('ShaderNodeTexCoord'); sep = nt.nodes.new('ShaderNodeSeparateXYZ')
    mp = nt.nodes.new('ShaderNodeMapRange'); ramp = nt.nodes.new('ShaderNodeValToRGB')
    bg = nt.nodes.new('ShaderNodeBackground'); out = nt.nodes.new('ShaderNodeOutputWorld')
    nt.links.new(tc.outputs['Generated'], sep.inputs['Vector'])
    mp.inputs['From Min'].default_value = -0.4; mp.inputs['From Max'].default_value = 0.9
    nt.links.new(sep.outputs['Z'], mp.inputs['Value'])
    nt.links.new(mp.outputs['Result'], ramp.inputs['Fac'])
    cr = ramp.color_ramp
    cr.elements[0].position = 0.0; cr.elements[0].color = hx('#3B3590')
    cr.elements[1].position = 1.0; cr.elements[1].color = hx('#1C2A86')
    e = cr.elements.new(0.42); e.color = hx('#8C78D6')
    nt.links.new(ramp.outputs['Color'], bg.inputs['Color'])
    bg.inputs['Strength'].default_value = 1.6
    nt.links.new(bg.outputs['Background'], out.inputs['Surface'])
    bpy.context.scene.world = w

def cartoon_lights(pc, center=(0, 0, 0), size=60):
    """warm soft key + cool fill, low contrast (REF_07 look)."""
    for nm, en, rot, col, ang in (('_sun', 3.4, (radians(52), radians(0), radians(35)), (1.0, 0.88, 0.76), radians(14)),
                                  ('_fill', 2.0, (radians(62), 0, radians(-140)), (0.62, 0.66, 1.0), radians(30))):
        ld = bpy.data.lights.new(nm, 'SUN'); ld.energy = en; ld.color = col; ld.angle = ang
        lo = bpy.data.objects.new(nm, ld); pc.objects.link(lo); lo.rotation_euler = rot

def ortho_cam(pc, target, scale, az_deg=-35, elev_deg=32, dist=400, name='_pcam'):
    """orthographic isometric-ish camera, from the front(-Y)-left(-X) corner like REF_07 (az<0 => left)."""
    cd = bpy.data.cameras.new(name); cd.type = 'ORTHO'; cd.ortho_scale = scale; cd.clip_end = 2000
    cam = bpy.data.objects.new(name, cd); pc.objects.link(cam)
    a, e = radians(az_deg), radians(elev_deg)
    t = Vector(target)
    cam.location = t + Vector((sin(a) * cos(e), -cos(a) * cos(e), sin(e))) * dist
    cam.rotation_euler = (t - cam.location).to_track_quat('-Z', 'Y').to_euler()
    bpy.context.scene.camera = cam
    return cam

def cartoon_preview(code, center=(0, 0, 6), scale=60, states=('normal',), size=(1200, 900), az=-35, elev=32, floor=True):
    """isolated preview of building `code` (root at wherever it is) with the cartoon look."""
    only_visible({code})
    pc = preview_setup(size)
    for o in list(pc.objects): bpy.data.objects.remove(o, do_unlink=True)
    old = bpy.data.objects.get('_pfloor')
    if old: bpy.data.objects.remove(old, do_unlink=True)
    setup_cartoon_world()
    cartoon_lights(pc)
    root = bpy.data.objects[code]
    c = root.matrix_world.translation + Vector(center)
    ortho_cam(pc, c, scale, az, elev)
    if floor:
        me = bpy.data.meshes.new('_pfloor'); bm = bmesh.new()
        bmesh.ops.create_cube(bm, size=1.0, matrix=Matrix.Translation(root.matrix_world.translation + Vector((0, 0, -0.6))) @ Matrix.Diagonal((scale * 2, scale * 2, 1, 1)))
        bm.to_mesh(me); bm.free()
        ob = bpy.data.objects.new('_pfloor', me); pc.objects.link(ob); ob.data.materials.append(CMAT('c_preview_floor', '#5A55A8'))
    for st in states:
        show_state(code, st)
        render_to(f'{PROJ}/previews/{code if st == "normal" else code + "_" + st}.png', size)
    reset_state_visibility(code)
    all_visible()
