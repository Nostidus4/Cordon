# common_B02_B03.py - extra helpers for B02 (Toa Giao Duc) and B03 (Kho tien). Builds on common.py (read-only, owned by lead).
exec(open('/Users/mac/Documents/Cordon/Blender/scripts/common.py').read(), globals())
import os

# ---------------------------------------------------------------- scene reset (headless, fresh)
def fresh_scene():
    for o in list(bpy.data.objects):
        bpy.data.objects.remove(o, do_unlink=True)
    for coll in (bpy.data.meshes, bpy.data.materials, bpy.data.curves, bpy.data.cameras, bpy.data.lights, bpy.data.images):
        for d in list(coll):
            coll.remove(d)
    for c in list(bpy.data.collections):
        bpy.data.collections.remove(c)
    sc = bpy.context.scene
    sc.unit_settings.system = 'METRIC'; sc.unit_settings.scale_length = 1.0
    w = bpy.data.worlds.get('GuardianWorld') or bpy.data.worlds.new('GuardianWorld')
    w.use_nodes = True
    bg = w.node_tree.nodes.get('Background')
    bg.inputs[0].default_value = (0.02, 0.05, 0.14, 1); bg.inputs[1].default_value = 1.6
    sc.world = w

# ---------------------------------------------------------------- text with a real font (Vietnamese glyphs)
_FONT = None
def get_font():
    global _FONT
    if _FONT is None:
        for p in ('/System/Library/Fonts/Supplemental/Arial Bold.ttf', '/System/Library/Fonts/Supplemental/Arial.ttf'):
            if os.path.exists(p):
                try:
                    _FONT = bpy.data.fonts.load(p); break
                except Exception:
                    pass
    return _FONT

def _text_font(s, txt, size, pos, m=None, rot=(pi / 2, 0, 0), depth=0.05, align='CENTER', bold=False):
    cu = bpy.data.curves.new('_t', 'FONT')
    cu.body = txt; cu.size = size; cu.extrude = depth / 2; cu.align_x = align; cu.align_y = 'CENTER'
    cu.resolution_u = 2
    f = get_font()
    if f: cu.font = f
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
MB.text = _text_font

# ---------------------------------------------------------------- geometry helpers
def rrect_pts(w, h, r, seg=3):
    """rounded rectangle polygon in (x,z), CCW, centred."""
    r = min(r, w / 2 - 1e-3, h / 2 - 1e-3)
    pts = []
    for cx, cz, a0 in ((w / 2 - r, h / 2 - r, 0), (-w / 2 + r, h / 2 - r, pi / 2), (-w / 2 + r, -h / 2 + r, pi), (w / 2 - r, -h / 2 + r, 1.5 * pi)):
        for i in range(seg + 1):
            a = a0 + (pi / 2) * i / seg
            pts.append((cx + r * cos(a), cz + r * sin(a)))
    return pts

def rplate(mb, w, h, th, pos, m, r=0.3, rot=(0, 0, 0), seg=3):
    """rounded plate facing -Y, thickness th along Y (centred on pos)."""
    mb.prism(rrect_pts(w, h, r, seg), th, pos, m, rot)

def rivet(mb, pos, r, m, rot=(pi / 2, 0, 0), h=0.12, verts=8):
    mb.cyl(r, h, pos, m, rot=rot, verts=verts, r2=r * 0.8, base=False)

def spoke_wheel(mb, pos, R, n, m_rim, m_spoke, m_hub, th=0.22, handles=True, m_knob=None, rot_off=0.0, seg=28):
    """vault wheel facing -Y. Spokes in XZ plane."""
    x, y, z = pos
    mb.ring(R, R * 0.84, th, pos, m_rim, rot=(pi / 2, 0, 0), seg=seg)
    for i in range(n):
        a = rot_off + 2 * pi * i / n
        L = R * 2.5 if handles else R * 1.8
        mb.box((L * 0.5, th * 0.8, R * 0.13), (x + cos(a) * L * 0.25, y, z + sin(a) * L * 0.25), m_spoke, rot=(0, -a, 0), bev=0.02, seg=1)
        if handles:
            mb.sphere(R * 0.16, (x + cos(a) * R * 1.27, y - 0.0, z + sin(a) * R * 1.27), m_knob or m_hub, sub=1)
    mb.cyl(R * 0.3, th * 1.8, pos, m_hub, rot=(pi / 2, 0, 0), verts=14, base=False, r2=R * 0.26)
    mb.cyl(R * 0.14, th * 2.4, (x, y - th * 0.4, z), m_rim, rot=(pi / 2, 0, 0), verts=10, base=False)

def louvers(mb, pos, w, h, n, m_frame, m_slat, d=0.3, rot=(0, 0, 0)):
    """vent grille in local XZ, facing -Y."""
    mb.push(pos, rot)
    mb.box((w, d, h), (0, 0.04, 0), 'steel_dark', bev=0.04, seg=1)
    fw = 0.18
    for dx in (-1, 1):
        mb.box((fw, d * 1.2, h + fw), (dx * (w / 2), -0.03, 0), m_frame, bev=0.03, seg=1)
    for dz in (-1, 1):
        mb.box((w + fw, d * 1.2, fw), (0, -0.03, dz * (h / 2)), m_frame, bev=0.03, seg=1)
    for i in range(n):
        z = -h / 2 + h * (i + 0.5) / n
        mb.box((w - 0.1, d * 0.8, h / n * 0.45), (0, -0.05, z), m_slat, rot=(0.45, 0, 0))
    mb.pop()

def bar_chart(mb, pos, w, h, vals, m, th=0.08, gap=0.35):
    """bars in local XZ, centred at pos, facing -Y. vals 0..1."""
    x, y, z = pos
    n = len(vals)
    bw = w / n * (1 - gap)
    for i, v in enumerate(vals):
        bx = x - w / 2 + w / n * (i + 0.5)
        bh = max(0.05, v * h)
        mb.box((bw, th, bh), (bx, y, z - h / 2 + bh / 2), m, bev=0.015, seg=1)

def polyline(mb, pts, w, m, th=0.08, y=0.0, closed=False):
    """thick line through (x,z) points, facing -Y."""
    for (x0, z0), (x1, z1) in zip(pts, pts[1:]):
        L = math.hypot(x1 - x0, z1 - z0)
        a = math.atan2(z1 - z0, x1 - x0)
        mb.box((L + w * 0.6, th, w), ((x0 + x1) / 2, y, (z0 + z1) / 2), m, rot=(0, -a, 0))

def coin_stack(mb, pos, r, n, m_coin, m_edge, th=0.14, rot=(0, 0, 0)):
    """coin stack standing on local Z (use rot=(pi/2,0,0) to lay it facing -Y)."""
    mb.push(pos, rot)
    for i in range(n):
        mb.cyl(r, th, (0, 0, i * th * 1.08), m_coin, verts=14)
        mb.cyl(r * 1.02, th * 0.28, (0, 0, i * th * 1.08 + th * 0.36), m_edge, verts=14)
    mb.pop()

def icon_coins(mb, pos, k, m, m_dark, th=0.14):
    """coin-stack icon facing -Y (three stacks)."""
    x, y, z = pos
    # side-view discs: wide flat boxes read better than cylinders at distance
    for dx, n in ((-0.34, 2), (0.0, 4), (0.34, 3)):
        for i in range(n):
            mb.box((0.28 * k, th, 0.12 * k), (x + dx * k, y, z - 0.36 * k + i * 0.16 * k), m, bev=0.02, seg=1)
            mb.box((0.1 * k, th * 1.15, 0.04 * k), (x + dx * k, y - 0.01, z - 0.36 * k + i * 0.16 * k), m_dark)

def icon_exchange(mb, pos, k, m, th=0.14):
    """two opposite arrows."""
    x, y, z = pos
    mb.box((0.8 * k, th, 0.1 * k), (x, y, z + 0.16 * k), m)
    mb.prism([(0, .16), (0, -.16), (.26, 0)], th, (x + 0.4 * k, y, z + 0.16 * k), m, scale=k)
    mb.box((0.8 * k, th, 0.1 * k), (x, y, z - 0.16 * k), m)
    mb.prism([(0, .16), (0, -.16), (-.26, 0)], th, (x - 0.4 * k, y, z - 0.16 * k), m, scale=k)

def icon_book_open(mb, pos, k, m_cover, m_page, m_line, th=0.16):
    """big open book emblem facing -Y: cover, two page blocks with glowing text lines."""
    x, y, z = pos
    for sgn in (-1, 1):
        mb.prism([(0.0, .46), (sgn * .62, .52), (sgn * .62, -.46), (0.0, -.40)], th, (x, y, z), m_cover, scale=k)
        mb.prism([(sgn * .03, .40), (sgn * .56, .45), (sgn * .56, -.38), (sgn * .03, -.33)], th * 0.6, (x, y - th * 0.5, z), m_page, scale=k)
        for j in range(5):
            zz = 0.28 - j * 0.16
            ln = 0.34 if j % 2 == 0 else 0.40
            mb.box((ln * k, th * 0.4, 0.045 * k), (x + sgn * (0.06 + ln / 2 + 0.04) * k, y - th * 0.85, z + zz * k), m_line)
    mb.box((0.05 * k, th * 1.2, 0.9 * k), (x, y - th * 0.35, z + 0.03 * k), m_cover)

def icon_padlock(mb, pos, k, m, m_dark, th=0.14):
    icon_lock(mb, pos, k, m, m_dark, th)

def icon_shield_lock(mb, pos, k, m_out, m_in, m_glyph, th=0.14):
    icon_shield(mb, pos, k, m_out, m_in, th)
    x, y, z = pos
    mb.box((0.34 * k, th, 0.26 * k), (x, y - th * 1.1, z - 0.1 * k), m_glyph, bev=0.015, seg=1)
    mb.ring(0.12 * k, 0.07 * k, th, (x, y - th * 1.1, z + 0.12 * k), m_glyph, rot=(pi / 2, 0, 0), seg=14, arc=pi, a0=0)

def dashes_rect(mb, hx, hy, z, w, dash, gap, m, h=0.04):
    """dashed rectangle loop on the ground, half extents hx, hy."""
    for (x0, y0, x1, y1) in ((-hx, -hy, hx, -hy), (hx, -hy, hx, hy), (hx, hy, -hx, hy), (-hx, hy, -hx, -hy)):
        L = math.hypot(x1 - x0, y1 - y0)
        n = int(L // (dash + gap))
        ang = math.atan2(y1 - y0, x1 - x0)
        ux, uy = (x1 - x0) / L, (y1 - y0) / L
        off = (L - n * (dash + gap) + gap) / 2
        for i in range(n):
            t = off + i * (dash + gap) + dash / 2
            mb.box((dash, w, h), (x0 + ux * t, y0 + uy * t, z), m, rot=(0, 0, ang))

def tri_slab_prism(mb, pts, length, pos, m, axis='y'):
    mb.prism(pts, length, pos, m)

# ---------------------------------------------------------------- save / export / verify
def save_blend(code):
    out = f'{PROJ}/out/{code}.blend'
    os.makedirs(f'{PROJ}/out', exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=out)
    return out

def export_glb(code, path=None):
    """glTF binary, only this building's hierarchy, +Y up, modifiers applied, Draco on, no cameras/lights."""
    path = path or f'/Users/mac/Documents/Cordon/Frontend/public/models/city/{code}.glb'
    os.makedirs(os.path.dirname(path), exist_ok=True)
    for ob in bpy.data.objects:
        ob.hide_viewport = False; ob.hide_render = False
        try: ob.hide_set(False)
        except Exception: pass
        ob.select_set(False)
    for lc in bpy.context.view_layer.layer_collection.children:
        lc.exclude = (lc.name != code)
    root = bpy.data.objects[code]
    root.select_set(True)
    for ch in root.children_recursive:
        ch.select_set(True)
    bpy.context.view_layer.objects.active = root
    kw = dict(filepath=path, export_format='GLB', use_selection=True, export_apply=True, export_yup=True,
              export_cameras=False, export_lights=False, export_extras=True,
              export_draco_mesh_compression_enable=True, export_draco_mesh_compression_level=6)
    try:
        bpy.ops.export_scene.gltf(**kw)
    except TypeError as e:
        print('export kw issue', e)
        kw.pop('export_extras', None)
        bpy.ops.export_scene.gltf(**kw)
    for lc in bpy.context.view_layer.layer_collection.children:
        lc.exclude = False
    print('glb', path, os.path.getsize(path))
    return path

def preview_states(code, center_z, dist, size=(1200, 900), az=-40, elev=32, lens=50, floor_r=26, extra=(), cy=0.0):
    """render all 4 states to Blender/previews/<code>_<state>.png (+ extra = [(tag, az, elev, dist, cz, state)])."""
    only_visible({code})
    root = bpy.data.objects[code]
    preview_floor(root.matrix_world.translation, floor_r)
    c = root.matrix_world.translation + Vector((0, cy, center_z))
    preview_rig(c, dist, elev, az, lens)
    for st in STATES:
        show_state(code, st)
        render_to(f'{PROJ}/previews/{code}_{st}.png', size)
    for tag, a2, e2, d2, cz2, st in extra:
        cc = root.matrix_world.translation + Vector((0, cy, cz2))
        preview_rig(cc, d2, e2, a2, lens)
        show_state(code, st)
        render_to(f'{PROJ}/previews/{code}_{tag}.png', size)
    reset_state_visibility(code)
    all_visible()

def hemisphere(mb, r, pos, m, scale=(1, 1, 1), u=32, v=16):
    """upper half of a smooth uv-sphere (z >= pos.z)."""
    old = set(mb.bm.verts)
    n0 = mb._begin()
    bmesh.ops.create_uvsphere(mb.bm, u_segments=u, v_segments=v, radius=r, matrix=mb._m(pos, (0, 0, 0), scale))
    mb._end(n0, m, True)
    kill = [vv for vv in mb.bm.verts if vv not in old and vv.co.z < pos[2] - 1e-4]
    bmesh.ops.delete(mb.bm, geom=kill, context='VERTS')


# =====================================================================================================
# CARTOON additions (built on the lead's CARTOON PRESET in common.py: CMAT, cbox, rtree, clamp_post, cperson, cbench, cplot)
# =====================================================================================================
def cwin(mb, u, z, w, h, d, rz=0.0, c=(0, 0), mf='white', mg='window_warm', cross=True, rec=None, bev=0.14):
    """chunky window on a facade (face frame like common.window): rounded frame plate, glowing pane, cross mullion, sill."""
    mb.push((c[0], c[1], 0), (0, 0, rz))
    y0 = -d
    mb.box((w + 0.55, 0.3, h + 0.55), (u, y0 - 0.1, z), mf, bev=bev, seg=2)
    mb.box((w, 0.12, h), (u, y0 - 0.3, z), mg)
    if cross:
        mb.box((0.15, 0.16, h), (u, y0 - 0.33, z), mf)
        mb.box((w, 0.16, 0.15), (u, y0 - 0.33, z), mf)
    mb.box((w + 1.0, 0.55, 0.22), (u, y0 - 0.25, z - h / 2 - 0.36), mf, bev=0.09, seg=2)
    mb.pop()
    if rec is not None:
        rec.append((u, z, w, h, d, rz, c))

def window_tints(b, state, mat, rec, name='window_tint', extra=None):
    mt = b.sp(state, name, [mat])
    for (u, z, w_, h_, d, rz, c) in rec:
        mt.push((c[0], c[1], 0), (0, 0, rz))
        mt.box((w_ * 0.96, 0.05, h_ * 0.96), (u, -d - 0.4, z), mat)
        mt.pop()
    if extra: extra(mt)
    return mt

def csiren(bld, state, name, pos, r, m_glow, m_base='steel_dark'):
    """chunky rotating siren beacon: base + dome + off-centre lens so a spin is visible. Origin = dome centre."""
    x, y, z = pos
    bb = bld.sp(state, f'{name}_base', [m_base])
    bb.cyl(r * 1.35, r * 0.5, (x, y, z), m_base, verts=14, bev=0.0, r2=r * 1.15)
    bb.cyl(r * 0.5, r * 0.5, (x, y, z + r * 0.4), m_base, verts=10)
    d = bld.sp(state, name, [m_glow, 'white'], origin=(x, y, z + r * 1.3))
    d.uvsphere(r, (x, y, z + r * 1.3), m_glow, scale=(1, 1, 1.05), u=16, v=10)
    d.box((r * 0.55, r * 1.7, r * 0.7), (x, y, z + r * 1.3), 'white', bev=r * 0.2, seg=2)        # reflector paddle (shows the spin)
    d.cyl(r * 0.45, r * 0.5, (x, y, z + r * 2.3), m_base, verts=10, r2=r * 0.25)
    return d

def caution_barrier(bld, state, name, pts, z=1.0, post_h=1.8):
    """posts + two black-yellow tapes through the (x, y) points. All in one object named B0x_state_<state>_<name>."""
    mb = bld.sp(state, name, ['hazard_yellow', 'hazard_black', 'steel_dark', 'state_incident'])
    for (x, y) in pts:
        mb.cyl(0.26, post_h, (x, y, 0), 'hazard_yellow', verts=8, r2=0.2)
        mb.cyl(0.275, 0.35, (x, y, 0.5), 'hazard_black', verts=8)
        mb.cyl(0.4, 0.2, (x, y, 0), 'hazard_black', verts=8)
        mb.sphere(0.27, (x, y, post_h + 0.1), 'state_incident', sub=1)
    for (p0, p1) in zip(pts, pts[1:]):
        hazard_bar(mb, p0, p1, post_h - 0.45, 0.5, 0.1, 9)
        hazard_bar(mb, p0, p1, post_h - 1.15, 0.5, 0.1, 9)
    return mb

def float_sign(bld, state, name, pos, w, h, m_panel, icon_fn, m_dark='hazard_black', rz=0.0, post=True):
    """floating cartoon sign board on two short posts with an icon painted on (icon_fn(mb, (x,y,z)))."""
    x, y, z = pos
    mb = bld.sp(state, name, [m_panel, m_dark, 'steel_dark', 'white'])
    mb.push((x, y, z), (0, 0, rz))
    if post:
        for dx in (-w * 0.32, w * 0.32):
            mb.cyl(0.14, 1.4, (dx, 0, 0), 'steel_dark', verts=6)
    mb.box((w, 0.4, h), (0, 0, 1.4 + h / 2), m_panel, bev=0.25, seg=3)
    mb.box((w - 0.7, 0.2, h - 0.7), (0, -0.2, 1.4 + h / 2), m_dark, bev=0.15, seg=2)
    icon_fn(mb, (0, -0.4, 1.4 + h / 2))
    mb.pop()
    return mb

def cpreview(code, center_z, scale, size=(1200, 900), az=-35, elev=32, cy=0.0, extra=(), states=STATES):
    """cartoon twilight ortho previews -> Blender/previews/<code>_<state>.png (+extras: (tag, az, elev, scale, cz, state))."""
    only_visible({code})
    pc = preview_setup(size)
    for o in list(pc.objects): bpy.data.objects.remove(o, do_unlink=True)
    setup_cartoon_world(); cartoon_lights(pc)
    root = bpy.data.objects[code]
    def floor(sc_):
        old = bpy.data.objects.get('_pfloor')
        if old: bpy.data.objects.remove(old, do_unlink=True)
        me = bpy.data.meshes.new('_pfloor'); bm = bmesh.new()
        bmesh.ops.create_cube(bm, size=1.0, matrix=Matrix.Translation((0, 0, -0.6)) @ Matrix.Diagonal((sc_ * 2, sc_ * 2, 1, 1)))
        bm.to_mesh(me); bm.free()
        ob = bpy.data.objects.new('_pfloor', me); pc.objects.link(ob); ob.data.materials.append(CMAT('c_preview_floor', '#5A55A8'))
    c = Vector((0, cy, center_z))
    floor(scale)
    cam = ortho_cam(pc, c, scale, az, elev)
    for st in states:
        show_state(code, st)
        render_to(f'{PROJ}/previews/{code}_{st}.png', size)
    for tag, a2, e2, sc2, cz2, st in extra:
        cam_old = bpy.data.objects.get('_pcam')
        if cam_old: bpy.data.objects.remove(cam_old, do_unlink=True)
        ortho_cam(pc, Vector((0, cy, cz2)), sc2, a2, e2)
        show_state(code, st)
        render_to(f'{PROJ}/previews/{code}_{tag}.png', size)
    reset_state_visibility(code)
    all_visible()


def ccheck(mb, pos, k, m, th=0.3):
    """chunky tick mark facing -Y (short stroke down-right, long stroke up-right)."""
    x, y, z = pos
    mb.box((0.5 * k, th, 0.16 * k), (x - 0.2 * k, y, z - 0.12 * k), m, rot=(0, 0.78, 0), bev=0.05 * k, seg=2)
    mb.box((0.9 * k, th, 0.16 * k), (x + 0.12 * k, y, z + 0.06 * k), m, rot=(0, -0.78, 0), bev=0.05 * k, seg=2)
