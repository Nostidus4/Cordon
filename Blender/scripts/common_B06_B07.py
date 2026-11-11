# common_B06_B07.py - extra helpers for B06 / B07 (exec'd after common.py by the building scripts).
#   exec(open('/Users/mac/Documents/Cordon/Blender/scripts/common_B06_B07.py').read(), globals())
import os, sys
exec(open('/Users/mac/Documents/Cordon/Blender/scripts/common.py').read(), globals())
import numpy as np

OUT = PROJ + '/out'
GLB_DIR = '/Users/mac/Documents/Cordon/Frontend/public/models/city'
os.makedirs(OUT, exist_ok=True)

# ---------------------------------------------------------------- fonts (Arial Bold has Vietnamese glyphs)
_FONT = None
def _font():
    global _FONT
    if _FONT is None:
        for p in ('/System/Library/Fonts/Supplemental/Arial Bold.ttf', '/System/Library/Fonts/Supplemental/Arial.ttf'):
            if os.path.exists(p):
                _FONT = bpy.data.fonts.load(p)
                break
        if _FONT is None:
            _FONT = False
    return _FONT

def txt(mb, s, size, pos, m=None, rot=(pi / 2, 0, 0), depth=0.05, align='CENTER'):
    """text mesh with a Vietnamese-capable font; same conventions as MB.text."""
    cu = bpy.data.curves.new('_t', 'FONT')
    cu.body = s; cu.size = size; cu.extrude = depth / 2; cu.align_x = align; cu.align_y = 'CENTER'
    cu.resolution_u = 2
    f = _font()
    if f:
        cu.font = f; cu.font_bold = f; cu.font_italic = f; cu.font_bold_italic = f
    ob = bpy.data.objects.new('_t', cu)
    _scratch_coll().objects.link(ob)
    bpy.context.view_layer.update()
    dg = bpy.context.evaluated_depsgraph_get()
    me = bpy.data.meshes.new_from_object(ob.evaluated_get(dg))
    me.transform(mb._m(pos, rot))
    n0 = mb._begin()
    mb.bm.from_mesh(me)
    mb._end(n0, m)
    bpy.data.meshes.remove(me); bpy.data.objects.remove(ob); bpy.data.curves.remove(cu)

# ---------------------------------------------------------------- UV quad + UI-like emissive textures
def quad(mb, pos, w, h, m, rot=(pi / 2, 0, 0)):
    """single UV-mapped quad (local XY, facing +Z; default rot makes it face -Y)."""
    M = mb._m(pos, rot)
    n0 = mb._begin()
    uvl = mb.bm.loops.layers.uv.get('UVMap') or mb.bm.loops.layers.uv.new('UVMap')
    vs = [mb.bm.verts.new(M @ Vector(p)) for p in ((-w / 2, -h / 2, 0), (w / 2, -h / 2, 0), (w / 2, h / 2, 0), (-w / 2, h / 2, 0))]
    f = mb.bm.faces.new(vs)
    for lp, uv in zip(f.loops, ((0, 0), (1, 0), (1, 1), (0, 1))):
        lp[uvl].uv = uv
    mb._end(n0, m)

def _rgb(h):
    h = h.lstrip('#'); return np.array([int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)])

def ui_mat(name, tint, bg='#04101E', es=1.0, w=512, h=256, seed=1):
    """emissive dashboard-like texture (grid, scanlines, corner ticks, faint sparkline noise)."""
    m = bpy.data.materials.get(name)
    if m: return m
    t, b = _rgb(tint), _rgb(bg)
    img = bpy.data.images.new(name + '_tex', w, h, alpha=False)
    ys, xs = np.mgrid[0:h, 0:w]
    base = np.ones((h, w, 3)) * b
    grad = (ys / h)[..., None]
    base = base * (0.6 + 0.8 * grad) + t * 0.06 * grad
    grid = ((xs % 32 == 0) | (ys % 32 == 0))[..., None] * 0.20
    base = base + grid * t
    scan = ((ys % 4) == 0)[..., None] * 0.04
    base = base + scan * t
    border = ((xs < 4) | (xs > w - 5) | (ys < 4) | (ys > h - 5))[..., None] * 0.55
    base = base + border * t
    rng = np.random.RandomState(seed)
    # faint sparkline
    v = np.cumsum(rng.randn(w // 8)) * 6 + h * 0.35
    for i in range(w // 8 - 1):
        for k in range(8):
            x = i * 8 + k; yv = int(v[i] + (v[i + 1] - v[i]) * k / 8)
            if 0 <= yv < h - 2:
                base[max(yv - 1, 0):yv + 2, x] = base[max(yv - 1, 0):yv + 2, x] * 0.5 + t * 0.5
    img.pixels = np.dstack([np.clip(base, 0, 1), np.ones((h, w))]).astype(np.float32).ravel()
    try: img.pack()
    except Exception as e: print('pack fail', e)
    m = bpy.data.materials.new(name); m.use_nodes = True
    nt = m.node_tree; bsdf = nt.nodes['Principled BSDF']
    tx = nt.nodes.new('ShaderNodeTexImage'); tx.image = img
    nt.links.new(tx.outputs['Color'], bsdf.inputs['Base Color'])
    nt.links.new(tx.outputs['Color'], bsdf.inputs['Emission Color'])
    bsdf.inputs['Emission Strength'].default_value = es
    bsdf.inputs['Roughness'].default_value = 0.3
    m.diffuse_color = hx(bg)
    return m

# ---------------------------------------------------------------- architecture bits
def gwin(mb, u, z, w, h, d, rz=0.0, c=(0, 0), mf='white', mg='glass', cols=2, rows=2, proud=0.16, t=0.22, sill=True, lintel=True):
    """glazed window on a facade (front=-Y at rz=0, d = wall distance from c)."""
    mb.push((c[0], c[1], 0), (0, 0, rz))
    ft = 0.14
    mb.box((w, 0.1, h), (u, -(d + 0.04), z), mg)
    y = -(d + proud * 0.5)
    for dx in (-1, 1):
        mb.box((ft, t, h + ft), (u + dx * (w / 2), y, z), mf, bev=0.025, seg=1)
    for dz in (-1, 1):
        mb.box((w + ft, t, ft), (u, y, z + dz * (h / 2)), mf, bev=0.025, seg=1)
    for i in range(1, cols):
        mb.box((0.07, t * 0.65, h), (u - w / 2 + w * i / cols, y, z), mf)
    for j in range(1, rows):
        mb.box((w, t * 0.65, 0.07), (u, y, z - h / 2 + h * j / rows), mf)
    if sill:
        mb.box((w + 0.5, t + 0.16, 0.14), (u, y - 0.05, z - h / 2 - 0.12), mf, bev=0.03, seg=1)
    if lintel:
        mb.box((w + 0.4, t + 0.08, 0.16), (u, y - 0.02, z + h / 2 + 0.14), mf, bev=0.03, seg=1)
    mb.pop()

def railing(mb, p0, p1, z, h, m, m_post=None, step=0.9, r=0.045):
    """simple railing from p0 to p1 (xy) standing on height z."""
    m_post = m_post or m
    a, b = Vector((p0[0], p0[1], 0)), Vector((p1[0], p1[1], 0))
    d = b - a; L = d.length; ang = math.atan2(d.y, d.x); n = max(1, int(round(L / step)))
    mb.push((a.x, a.y, z), (0, 0, ang))
    for i in range(n + 1):
        mb.box((0.1, 0.1, h), (L * i / n, 0, 0), m_post, base=True, bev=0.015, seg=1)
    mb.box((L, 0.1, 0.08), (L / 2, 0, h), m, bev=0.02, seg=1)
    mb.box((L, 0.06, 0.05), (L / 2, 0, h * 0.5), m)
    mb.box((L, 0.06, 0.05), (L / 2, 0, h * 0.25), m)
    mb.pop()

def bush(ml, pos, s=1.0, mats=('leaf_a', 'leaf_b'), rng=None):
    x, y, z = pos
    ml.sphere(0.8 * s, (x, y, z + 0.55 * s), mats[0], sub=1, scale=(1.2, 1.0, 0.85))
    ml.sphere(0.5 * s, (x + 0.55 * s, y + 0.15 * s, z + 0.6 * s), mats[1], sub=1)
    ml.sphere(0.45 * s, (x - 0.5 * s, y - 0.2 * s, z + 0.55 * s), mats[1], sub=1)

def flowers(ml, pos, w, d, n, mats=('flower_pink', 'flower_yellow', 'white'), seed=0, z=0.0, r=0.1):
    rg = random.Random(seed)
    for i in range(n):
        ml.sphere(r, (pos[0] + rg.uniform(-w / 2, w / 2), pos[1] + rg.uniform(-d / 2, d / 2), pos[2] + z + rg.uniform(0, 0.12)), mats[i % len(mats)], sub=1)

def planter(mb, ml, pos, w, d, h=0.7, m_box='stone_light', m_soil='B_soil', shrub=True, seed=0, mats=('leaf_a', 'leaf_b'), fl=True):
    x, y, z = pos
    mb.box((w, d, h), (x, y, z), m_box, base=True, bev=0.06, seg=1)
    mb.box((w + 0.16, d + 0.16, 0.1), (x, y, z + h), 'white', base=True, bev=0.02, seg=1)
    mb.box((w - 0.2, d - 0.2, 0.12), (x, y, z + h + 0.05), m_soil, base=True)
    rg = random.Random(seed)
    nb = max(1, int(w / 1.3))
    if shrub:
        for i in range(nb):
            bush(ml, (x - w / 2 + (i + 0.5) * w / nb, y + rg.uniform(-0.05, 0.05) * d, z + h + 0.1), rg.uniform(0.55, 0.8), mats)
    if fl:
        flowers(ml, (x, y, z + h + 0.15), w - 0.4, d - 0.3, int(w * d * 2.2), seed=seed, r=0.09)

def poly_line(mb, pts, w, th, m, joints=True, m_joint=None):
    """polyline in local XZ plane (x,z) with thickness th along Y."""
    for i in range(len(pts) - 1):
        (x0, z0), (x1, z1) = pts[i], pts[i + 1]
        L = math.hypot(x1 - x0, z1 - z0); a = math.atan2(z1 - z0, x1 - x0)
        mb.box((L + w * 0.2, th, w), ((x0 + x1) / 2, 0, (z0 + z1) / 2), m, rot=(0, -a, 0), bev=0.01, seg=1)
    if joints:
        for (x, z) in pts:
            mb.cyl(w * 0.62, th * 1.05, (x, 0, z), m_joint or m, rot=(pi / 2, 0, 0), verts=10, base=False)

def arrow_head(mb, pos, k, m, ang=0.0, th=0.14):
    """triangle arrow head at pos in XZ plane pointing along angle `ang` (rad, 0 = +X, + = up)."""
    pts = [(0.5 * k, 0), (-0.35 * k, 0.4 * k), (-0.15 * k, 0), (-0.35 * k, -0.4 * k)]
    c, s = cos(ang), sin(ang)
    pts = [(c * x - s * z, s * x + c * z) for x, z in pts]
    mb.prism(pts, th, pos, m)

def donut(mb, pos, ro, ri, segs, h=0.14, rot=(pi / 2, 0, 0), a0=pi / 2, gap=0.04, seg=64):
    """segs = [(fraction, material), ...] going clockwise from a0."""
    a = a0
    for frac, m in segs:
        arc = 2 * pi * frac
        mb.ring(ro, ri, h, pos, m, rot=rot, seg=seg, arc=-(arc - gap), a0=a - gap / 2 if False else a)
        a -= arc

def leaf_pts(n=14, w=0.46, L=0.62, skew=0.12):
    pts = []
    right = []
    for i in range(n + 1):
        t = i / n
        y = -L + 2 * L * t
        f = w * (math.sin(math.pi * t) ** 0.85) * (1 + skew * (t - 0.5))
        right.append((f, y))
    left = [(-f * 0.92, y) for f, y in reversed(right[1:-1])]
    return right + left

def leaf_logo(mb, pos, k, m_out, m_in, m_vein, th=0.16, rot=(0, 0.0, 0), tilt=0.6):
    """leaf with white-ish outline, glowing fill and dark veins (faces -Y). tilt rotates it about Y (leaf points up-right)."""
    x, y, z = pos
    P = leaf_pts()
    c, s = cos(tilt), sin(tilt)
    def rt(pts, sc=1.0):
        return [((c * px + s * py) * sc, (-s * px + c * py) * sc) for px, py in pts]
    # rotate so +y axis of the leaf points up-right: (px,py)->(x,z)
    def tf(pts, sc):
        return [(( px * c + py * s) * sc, (-px * s + py * c) * sc) for px, py in pts]
    mb.prism(tf(P, 1.0), th, (x, y, z), m_out, scale=k)
    mb.prism(tf(P, 0.86), th * 0.7, (x, y - th * 0.45, z), m_in, scale=k)
    # midrib and side veins
    def ln(a, b, wd, depth):
        x0, z0 = tf([a], 0.84)[0]; x1, z1 = tf([b], 0.84)[0]
        L = math.hypot(x1 - x0, z1 - z0); ang = math.atan2(z1 - z0, x1 - x0)
        mb.box((L * k, depth, wd * k), (x + (x0 + x1) / 2 * k, y - th * 0.9, z + (z0 + z1) / 2 * k), m_vein, rot=(0, -ang, 0))
    ln((0, -0.62), (0, 0.56), 0.035, th * 0.35)
    for t in (-0.34, -0.12, 0.1, 0.32):
        ln((0, t), (0.3 * (1 - abs(t) * 0.6), t + 0.22), 0.022, th * 0.3)
        ln((0, t), (-0.28 * (1 - abs(t) * 0.6), t + 0.2), 0.022, th * 0.3)

def pawn_icon(mb, pos, k, m, th=0.12):
    x, y, z = pos
    mb.cyl(0.3 * k, 0.1 * k, (x, y, z - 0.45 * k), m, rot=(pi / 2, 0, 0), verts=12, base=False)
    mb.cyl(0.18 * k, 0.4 * k, (x, y, z - 0.15 * k), m, rot=(pi / 2, 0, 0), verts=10, base=False, r2=0.3 * k)
    mb.cyl(0.12 * k, 0.2 * k, (x, y, z + 0.1 * k), m, rot=(pi / 2, 0, 0), verts=10, base=False)
    mb.cyl(0.14 * k, 0.05 * k, (x, y, z + 0.2 * k), m, rot=(pi / 2, 0, 0), verts=10, base=False, r2=0.14 * k)
    mb.uvsphere(0.17 * k, (x, y, z + 0.34 * k), m, u=10, v=6)

def coin_stack(mb, pos, k, m, m_edge=None, n=4):
    x, y, z = pos
    for i in range(n):
        mb.cyl(0.3 * k, 0.1 * k, (x, y, z - 0.35 * k + i * 0.13 * k), m_edge if (m_edge and i % 2) else m, rot=(pi / 2, 0, 0), verts=14, base=False)

def magnifier(mb, pos, k, m, th=0.12):
    x, y, z = pos
    mb.ring(0.32 * k, 0.22 * k, th, (x - 0.08 * k, y, z + 0.08 * k), m, rot=(pi / 2, 0, 0), seg=28)
    mb.box((0.34 * k, th, 0.1 * k), (x + 0.28 * k, y, z - 0.25 * k), m, rot=(0, -0.78, 0), bev=0.01, seg=1)

def edge_strip(mb, x0, y0, x1, y1, z, m, w=0.14, h=0.12):
    """glowing rectangle outline on the ground/trim."""
    mb.box((x1 - x0, w, h), ((x0 + x1) / 2, y0, z), m)
    mb.box((x1 - x0, w, h), ((x0 + x1) / 2, y1, z), m)
    mb.box((w, y1 - y0 - w, h), (x0, (y0 + y1) / 2, z), m)
    mb.box((w, y1 - y0 - w, h), (x1, (y0 + y1) / 2, z), m)

def bollard(mb, pos, m='steel_dark', m_cap='lamp_glow', h=0.8):
    x, y, z = pos
    mb.cyl(0.14, h, (x, y, z), m, verts=8, bev=0.01)
    mb.cyl(0.16, 0.08, (x, y, z + h), m_cap, verts=8)

def trash_can(mb, pos, m='steel_dark', m_in='steel'):
    x, y, z = pos
    mb.cyl(0.28, 0.85, (x, y, z), m_in, r2=0.32, verts=10)
    mb.cyl(0.34, 0.08, (x, y, z + 0.85), m, verts=10)
    for i in range(3):
        mb.box((0.05, 0.02, 0.6), (x + (i - 1) * 0.15, y - 0.3, z + 0.12), m, base=True)

def kiosk(mb, pos, rz, m_body, m_trim, m_screen, m_glow):
    x, y, z = pos
    mb.push((x, y, z), (0, 0, rz))
    mb.box((0.9, 0.5, 1.0), (0, 0, 0), m_body, base=True, bev=0.04)
    mb.box((0.9, 0.55, 0.12), (0, 0, 1.0), m_trim, base=True, bev=0.03)
    mb.box((0.8, 0.12, 0.7), (0, -0.2, 1.3), m_trim, rot=(-0.4, 0, 0), bev=0.03)
    mb.box((0.68, 0.06, 0.55), (0, -0.28, 1.31), m_screen, rot=(-0.4, 0, 0))
    mb.box((0.9, 0.03, 0.08), (0, -0.26, 0.5), m_glow)
    mb.pop()

def ac_unit(mb, pos, rz=0, m='steel', m_fan='steel_dark'):
    x, y, z = pos
    mb.push((x, y, z), (0, 0, rz))
    mb.box((1.8, 1.2, 1.0), (0, 0, 0), m, base=True, bev=0.04)
    mb.box((1.9, 1.3, 0.1), (0, 0, 1.0), 'white', base=True, bev=0.02, seg=1)
    for dx in (-0.45, 0.45):
        mb.cyl(0.34, 0.05, (dx, -0.61, 0.5), m_fan, rot=(pi / 2, 0, 0), verts=14, base=False)
        mb.cyl(0.07, 0.07, (dx, -0.63, 0.5), 'steel', rot=(pi / 2, 0, 0), verts=8, base=False)
    for i in range(5):
        mb.box((0.05, 0.04, 0.8), (-0.85 + i * 0.05, -0.62, 0.5), m_fan)
    mb.pop()

def solar_panel(mb, pos, w, d, tilt, m_cell='B_solar', m_frame='steel', rz=0):
    x, y, z = pos
    mb.push((x, y, z), (0, 0, rz))
    for dx in (-0.4, 0.4):
        mb.box((0.08, 0.08, 0.5), (dx * w, d * 0.5, 0), 'steel_dark', base=True)
    mb.push((0, 0, 0.5), (tilt, 0, 0))
    mb.box((w, d, 0.07), (0, 0, 0), m_frame, bev=0.015, seg=1)
    nx, ny = max(2, int(w / 0.9)), max(1, int(d / 0.9))
    cw, cd = (w - 0.12) / nx, (d - 0.12) / ny
    for i in range(nx):
        for j in range(ny):
            mb.box((cw - 0.05, cd - 0.05, 0.03), (-w / 2 + 0.06 + cw * (i + 0.5), -d / 2 + 0.06 + cd * (j + 0.5), 0.04), m_cell)
    mb.pop()
    mb.pop()

# ---------------------------------------------------------------- scene finish / export / verify
def finalize_and_save(b, code):
    total = b.finish()
    for c in list(bpy.data.collections):
        if c.name == '_scratch' and not c.objects:
            bpy.data.collections.remove(c)
    bpy.context.view_layer.update()
    bpy.ops.wm.save_as_mainfile(filepath=f'{OUT}/{code}.blend')
    return total

def export_glb(code):
    bpy.ops.object.select_all(action='DESELECT')
    root = bpy.data.objects[code]
    root.select_set(True)
    for o in root.children_recursive:
        o.select_set(True)
    bpy.context.view_layer.objects.active = root
    path = f'{GLB_DIR}/{code}.glb'
    kw = dict(filepath=path, export_format='GLB', use_selection=True, export_apply=True, export_yup=True,
              export_cameras=False, export_lights=False, export_extras=True,
              export_draco_mesh_compression_enable=True, export_draco_mesh_compression_level=6)
    try:
        bpy.ops.export_scene.gltf(**kw)
    except Exception as e:
        print('draco export failed -> retry without', e)
        kw['export_draco_mesh_compression_enable'] = False
        bpy.ops.export_scene.gltf(**kw)
    print('GLB', path, os.path.getsize(path))
    return path


# ================================================================= CARTOON helpers (B06 / B07) - build on common.py cartoon preset
def bx(mb, size, pos, m=None, rot=(0, 0, 0), bev=0.35, seg=3, base=False):
    """chunky rounded box; bevel faces smoothed, big faces flat."""
    n0 = mb._begin()
    mb.box(size, pos, m, rot, bev, seg, base)
    new = [f for f in mb.bm.faces if f not in n0]
    if bev and new:
        amax = max(f.calc_area() for f in new)
        for f in new:
            if f.calc_area() < 0.3 * amax:
                f.smooth = True

def cwin(mb, u, z, w, h, d, rz=0.0, c=(0, 0), mf='white', mg='window_warm', cols=2, rows=2, depth=0.32):
    """chunky toy window on a facade (front = -Y at rz=0; d = wall distance from c)."""
    mb.push((c[0], c[1], 0), (0, 0, rz))
    ft = 0.22
    mb.box((w, 0.2, h), (u, -(d + 0.03), z), mg)
    for dx in (-1, 1):
        bx(mb, (ft, depth, h + ft), (u + dx * w / 2, -(d + depth * 0.4), z), mf, bev=0.07, seg=1)
    for dz in (-1, 1):
        bx(mb, (w + ft, depth, ft), (u, -(d + depth * 0.4), z + dz * h / 2), mf, bev=0.07, seg=1)
    for i in range(1, cols):
        mb.box((0.12, depth * 0.7, h), (u - w / 2 + w * i / cols, -(d + depth * 0.3), z), mf)
    for j in range(1, rows):
        mb.box((w, depth * 0.7, 0.12), (u, -(d + depth * 0.3), z - h / 2 + h * j / rows), mf)
    bx(mb, (w + 0.6, depth + 0.2, 0.22), (u, -(d + depth * 0.5), z - h / 2 - 0.2), mf, bev=0.08, seg=1)
    mb.pop()

def rrect_ring(mb, cx, cy, w, d, r, z, wd, hh, m):
    """flat rounded-rectangle outline (glow strip)."""
    sx, sy = w / 2 - r, d / 2 - r
    mb.box((2 * sx, wd, hh), (cx, cy + d / 2 - wd / 2, z), m); mb.box((2 * sx, wd, hh), (cx, cy - d / 2 + wd / 2, z), m)
    mb.box((wd, 2 * sy, hh), (cx - w / 2 + wd / 2, cy, z), m); mb.box((wd, 2 * sy, hh), (cx + w / 2 - wd / 2, cy, z), m)
    for (qx, qy, a0) in ((1, 1, 0), (-1, 1, pi / 2), (-1, -1, pi), (1, -1, 3 * pi / 2)):
        mb.ring(r, r - wd, hh, (cx + qx * sx, cy + qy * sy, z), m, seg=36, arc=pi / 2, a0=a0)

def csiren(b, state, name, pos, r, m_glow, m_base='c_pole_post', beams=True):
    """chunky siren: base + glowing dome (+ two light beams so rotation reads). Dome object origin = dome centre."""
    x, y, z = pos
    bs = b.sp(state, f'{name}_base', [m_base]); bs.cyl(r * 1.35, r * 0.7, pos, m_base, verts=14, bev=0.06, smooth=True)
    d = b.sp(state, name, [m_glow, 'c_pole_post'], origin=(x, y, z + r * 0.7 + r * 0.4))
    d.uvsphere(r, (x, y, z + r * 0.7 + r * 0.4), m_glow, scale=(1, 1, 1.15), u=16, v=10)
    for rz_ in ((0, pi) if beams else ()):
        d.push((x, y, z + r * 0.7 + r * 0.4), (0, 0, rz_))
        d.cyl(r * 0.22, r * 1.7, (r * 1.55, 0, 0), m_glow, rot=(0, pi / 2, 0), verts=8, r2=r * 0.5, base=False)
        d.pop()
    return d

def tape_barrier(b, state, name, pts, z, h=1.45):
    """black-yellow caution tape on chunky posts along polyline pts (xy)."""
    s = b.sp(state, name, ['hazard_yellow', 'hazard_black', 'state_incident', 'c_pole_post'])
    for (x, y) in pts:
        s.cyl(0.24, h, (x, y, z), 'hazard_black', verts=10, bev=0.03, smooth=True)
        s.cyl(0.29, 0.2, (x, y, z + h), 'state_incident', verts=10, smooth=True)
        s.box((0.7, 0.7, 0.18), (x, y, z), 'c_pole_post', base=True, bev=0.05, seg=1)
    for (p0, p1) in zip(pts[:-1], pts[1:]):
        a, b2 = Vector((p0[0], p0[1], 0)), Vector((p1[0], p1[1], 0))
        dv = b2 - a; L = dv.length; ang = math.atan2(dv.y, dv.x); n = max(2, int(L / 0.55))
        for zz in (z + h - 0.35, z + h - 0.95):
            s.push(((a + b2).x / 2, (a + b2).y / 2, zz), (0, 0, ang))
            sl = L / n
            for i in range(n):
                s.box((sl * 0.98, 0.06, 0.3), (-L / 2 + sl * (i + 0.5), 0, 0), 'hazard_yellow' if i % 2 == 0 else 'hazard_black')
            s.pop()
    return s

def tint_overlay(b, state, parts, m_tint):
    """thin translucent emissive shell over the building volumes so the whole building reads tinted in this state.
    parts = [(size, pos)] chunky boxes (base=True positions)."""
    s = b.sp(state, 'tint_shell', [m_tint])
    for size, pos, bv in parts:
        bx(s, (size[0] + 0.2, size[1] + 0.2, size[2] + 0.12), (pos[0], pos[1], pos[2] - 0.0), m_tint, bev=bv, seg=3, base=True)
    return s

def csign(s, pos, rz, w, h, m_panel, m_edge, z0=2.1, post=True):
    """chunky standing board: panel centre at z0+h/2. returns nothing; draw text with s.push(pos,(0,0,rz))."""
    s.push(pos, (0, 0, rz))
    if post:
        for dx in (-1, 1):
            bx(s, (0.35, 0.35, z0), (dx * (w / 2 - 0.7), 0, 0), 'c_pole_post', bev=0.08, seg=2, base=True)
    bx(s, (w, 0.5, h), (0, 0, z0 + h / 2), m_panel, bev=0.22, seg=3)
    bx(s, (w + 0.1, 0.18, 0.2), (0, -0.28, z0 + h - 0.05), m_edge, bev=0.08, seg=1)
    bx(s, (w + 0.1, 0.18, 0.2), (0, -0.28, z0 + 0.05), m_edge, bev=0.08, seg=1)
    s.pop()

def cdome(mb, rx, ry, rz_, pos, m, u=28, v=10):
    """upper half ellipsoid."""
    n0 = mb._begin()
    M = mb._m(pos, (0, 0, 0), (rx, ry, rz_))
    r = bmesh.ops.create_uvsphere(mb.bm, u_segments=u, v_segments=v * 2, radius=1.0, matrix=M)
    low = [vv for vv in r['verts'] if vv.co.z < pos[2] - 0.001]
    bmesh.ops.delete(mb.bm, geom=low, context='VERTS')
    mb._end(n0, m, True)

def render_cartoon(code, states, center_z=6.0, scale=34, az=-35, elev=32, size=(1200, 900), tag=''):
    only_visible({code})
    pc = preview_setup(size)
    for o in list(pc.objects):
        bpy.data.objects.remove(o, do_unlink=True)
    old = bpy.data.objects.get('_pfloor')
    if old: bpy.data.objects.remove(old, do_unlink=True)
    setup_cartoon_world(); cartoon_lights(pc)
    root = bpy.data.objects[code]
    c = root.matrix_world.translation + Vector((0, 0, center_z))
    ortho_cam(pc, c, scale, az, elev)
    me = bpy.data.meshes.new('_pfloor'); bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0, matrix=Matrix.Translation(root.matrix_world.translation + Vector((0, 0, -0.6))) @ Matrix.Diagonal((scale * 3, scale * 3, 1, 1)))
    bm.to_mesh(me); bm.free()
    ob = bpy.data.objects.new('_pfloor', me); pc.objects.link(ob); ob.data.materials.append(CMAT('c_preview_floor', '#4B4A9A'))
    for st in states:
        show_state(code, st)
        render_to(f'{PROJ}/previews/{code}_{st}{tag}.png', size)
    reset_state_visibility(code)
    all_visible()

def check2(mb, pos, k, m, th=0.12):
    """proper tick mark (short stroke down-right, long stroke up-right) in the XZ plane."""
    x, y, z = pos
    mb.box((0.26 * k, th, 0.09 * k), (x - 0.17 * k, y, z - 0.07 * k), m, rot=(0, 0.85, 0), bev=0.01, seg=1)
    mb.box((0.56 * k, th, 0.09 * k), (x + 0.09 * k, y, z + 0.0 * k), m, rot=(0, -0.85, 0), bev=0.01, seg=1)
