# common_B04_B05.py - extra helpers for B04 / B05 (exec AFTER common.py, in the same globals()).
import numpy as np, random

# ------------------------------------------------------------------ world / render helpers
def navy_world(col='#25407A'):
    w = bpy.data.worlds.get('_navy') or bpy.data.worlds.new('_navy')
    w.use_nodes = True
    bg = w.node_tree.nodes.get('Background')
    bg.inputs['Color'].default_value = hx(col)
    bg.inputs['Strength'].default_value = 1.0
    bpy.context.scene.world = w

def glass(name, col='#7FD3FF', alpha=0.28, rough=0.05):
    m = bpy.data.materials.get(name)
    if m: return m
    m = MAT(name, col, rough, 0.0, None, 0.0, alpha)
    b = m.node_tree.nodes['Principled BSDF']
    try: b.inputs['Transmission Weight'].default_value = 0.0
    except Exception: pass
    try: b.inputs['IOR'].default_value = 1.45
    except Exception: pass
    return m

# ------------------------------------------------------------------ procedural UI textures (emissive screens)
def _fill(a, x0, y0, x1, y1, c):
    H, W = a.shape[:2]
    x0, x1 = max(0, int(x0)), min(W, int(x1)); y0, y1 = max(0, int(y0)), min(H, int(y1))
    if x1 > x0 and y1 > y0:
        a[y0:y1, x0:x1, :3] = c; a[y0:y1, x0:x1, 3] = 1.0

def _rgb(h):
    h = h.lstrip('#'); return [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]

def ui_image(name, kind='dash', accent='#FFA500', w=512, h=256, seed=1, rows=5, vals=None):
    """draw UI-like screen. kinds: dash (header+chart+rows), list (checkbox rows), cams (cctv grid), pos (big button), bars."""
    rnd = random.Random(seed)
    a = np.zeros((h, w, 4), dtype=np.float32)
    bg = np.array(_rgb('#07111F')); ac = np.array(_rgb(accent)); dim = ac * 0.35 + 0.04
    a[:, :, :3] = bg; a[:, :, 3] = 1.0
    for y in range(h):                               # subtle vertical gradient
        a[y, :, :3] = bg * (0.7 + 0.5 * y / h)
    _fill(a, 0, 0, w, h * 0.13, dim)                 # header bar
    _fill(a, w * 0.03, h * 0.05, w * 0.22, h * 0.085, ac)
    for i in range(3):
        _fill(a, w * (0.80 + i * 0.06), h * 0.04, w * (0.84 + i * 0.06), h * 0.09, ac * (0.5 + 0.2 * i))
    if kind == 'dash':
        cw = w * 0.52
        n = 14
        for i in range(n):                           # bar chart
            bh = (0.25 + 0.7 * rnd.random()) * h * 0.55
            if vals: bh = vals[i % len(vals)] * h * 0.55
            _fill(a, w * 0.05 + i * cw / n, h * 0.9 - bh, w * 0.05 + i * cw / n + cw / n * 0.7, h * 0.9, ac * (0.6 + 0.4 * rnd.random()))
        for r in range(rows):                        # side rows
            y = h * (0.2 + r * 0.14)
            _fill(a, w * 0.62, y, w * 0.95, y + h * 0.09, dim)
            _fill(a, w * 0.64, y + h * 0.02, w * (0.64 + 0.1 + 0.15 * rnd.random()), y + h * 0.07, ac)
            _fill(a, w * 0.88, y + h * 0.02, w * 0.93, y + h * 0.07, ac * 1.0)
    elif kind == 'list':
        for r in range(rows):
            y = h * (0.2 + r * (0.75 / rows))
            _fill(a, w * 0.05, y, w * 0.12, y + h * 0.07, ac)
            _fill(a, w * 0.16, y + h * 0.015, w * (0.45 + 0.4 * rnd.random()), y + h * 0.055, dim * 2.0)
    elif kind == 'cams':
        cols, rws = 3, 2
        for cx in range(cols):
            for cy in range(rws):
                x0 = w * (0.03 + cx * 0.32); y0 = h * (0.17 + cy * 0.41)
                _fill(a, x0, y0, x0 + w * 0.30, y0 + h * 0.38, dim * 0.8)
                _fill(a, x0 + w * 0.02, y0 + h * 0.02, x0 + w * 0.04, y0 + h * 0.04, _rgb('#FF3040'))
                px = x0 + w * (0.08 + 0.14 * rnd.random())      # silhouette
                _fill(a, px, y0 + h * 0.18, px + w * 0.03, y0 + h * 0.37, ac * 0.8)
                _fill(a, px - w * 0.003, y0 + h * 0.12, px + w * 0.033, y0 + h * 0.18, ac * 0.8)
    elif kind == 'pos':
        _fill(a, w * 0.08, h * 0.2, w * 0.92, h * 0.5, dim * 1.5)
        for r in range(3):
            _fill(a, w * 0.12, h * (0.24 + r * 0.08), w * (0.5 + 0.3 * rnd.random()), h * (0.27 + r * 0.08), ac)
        _fill(a, w * 0.15, h * 0.62, w * 0.85, h * 0.9, ac)
    elif kind == 'bars':
        for r in range(rows):
            y = h * (0.2 + r * (0.75 / rows))
            _fill(a, w * 0.05, y, w * 0.95, y + h * 0.08, dim)
            _fill(a, w * 0.05, y, w * (0.05 + 0.9 * (0.3 + 0.7 * rnd.random())), y + h * 0.08, ac)
    # scanlines
    for y in range(0, h, 4):
        a[y, :, :3] *= 0.82
    img = bpy.data.images.get(name) or bpy.data.images.new(name, w, h, alpha=False)
    lin = np.vectorize(lambda c: c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4)
    out = np.flipud(a).copy()                        # image origin is bottom-left
    out[:, :, :3] = lin(np.clip(out[:, :, :3], 0, 1))
    img.pixels.foreach_set(out.ravel())
    img.pack()
    return img

def tex_mat(name, img, es=1.6, rough=0.25):
    m = bpy.data.materials.get(name)
    if m: return m
    m = bpy.data.materials.new(name); m.use_nodes = True
    nt = m.node_tree; b = nt.nodes['Principled BSDF']
    tx = nt.nodes.new('ShaderNodeTexImage'); tx.image = img; tx.interpolation = 'Linear'
    nt.links.new(tx.outputs['Color'], b.inputs['Base Color'])
    nt.links.new(tx.outputs['Color'], b.inputs['Emission Color'])
    b.inputs['Emission Strength'].default_value = es
    b.inputs['Roughness'].default_value = rough
    return m

def screen_quad(mb, pos, w, h, m, rot=(0, 0, 0)):
    """single UV-mapped quad in local XZ plane facing -Y (u along x, v along z)."""
    M = mb._m(pos, rot)
    n0 = mb._begin()
    pts = [(-w / 2, -h / 2), (w / 2, -h / 2), (w / 2, h / 2), (-w / 2, h / 2)]
    vs = [mb.bm.verts.new(M @ Vector((x, 0, z))) for x, z in pts]
    f = mb.bm.faces.new(vs)
    uvl = mb.bm.loops.layers.uv.verify()
    for l, uv in zip(f.loops, ((0, 0), (1, 0), (1, 1), (0, 1))):
        l[uvl].uv = uv
    mb._end(n0, m)

def ui_panel(mb, pos, w, h, m_frame, m_screen, rot=(0, 0, 0), depth=0.16, bev=0.035):
    """framed screen with textured UV quad (m_screen should be a tex_mat)."""
    mb.push(pos, rot)
    mb.box((w, depth, h), (0, 0, 0), m_frame, bev=bev, seg=2)
    screen_quad(mb, (0, -depth / 2 - 0.004, 0), w - 0.28, h - 0.28, m_screen)
    mb.pop()

# ------------------------------------------------------------------ small architectural builders
def box_frame(mb, c, w, h, t, m, y=0.0, d=0.12, bev=0.0):
    """rectangular frame in XZ plane: centre c=(x,z), outer w x h, bar thickness t, depth d (along y)."""
    x, z = c
    mb.box((w, d, t), (x, y, z + h / 2 - t / 2), m, bev=bev, seg=1)
    mb.box((w, d, t), (x, y, z - h / 2 + t / 2), m, bev=bev, seg=1)
    mb.box((t, d, h - 2 * t), (x - w / 2 + t / 2, y, z), m, bev=bev, seg=1)
    mb.box((t, d, h - 2 * t), (x + w / 2 - t / 2, y, z), m, bev=bev, seg=1)

def half_disc(r, n=10):
    return [(r * cos(pi + pi * i / n), r * sin(pi + pi * i / n)) for i in range(n + 1)]

def striped_awning(mb, x0, x1, yw, zw, yf, zf, n, mA, mB, th=0.14, scallop=True, vh=0.75, bev=0.03):
    """sloped striped awning from wall edge (yw,zw) down to front lip (yf,zf), n stripes across x0..x1."""
    sw = (x1 - x0) / n
    L = math.hypot(yw - yf, zw - zf)
    ang = math.atan2(zw - zf, yw - yf)
    for i in range(n):
        m = mA if i % 2 == 0 else mB
        cx = x0 + sw * (i + 0.5)
        mb.box((sw * 0.995, L, th), (cx, (yw + yf) / 2, (zw + zf) / 2), m, rot=(ang, 0, 0), bev=bev, seg=1)
        if scallop:
            mb.box((sw * 0.995, th, vh), (cx, yf - 0.02, zf - vh / 2 + 0.05), m, bev=0.015, seg=1)
            mb.prism(half_disc(sw * 0.5, 8), th, (cx, yf - 0.02, zf - vh + 0.05), m)
    # rail along the lip
    mb.box((x1 - x0 + 0.1, 0.12, 0.1), (0, yf - 0.05, zf + 0.02), mA, bev=0.02, seg=1)

def ac_unit(mb, pos, rz=0, m_body='white', m_dark='steel_dark', s=1.0):
    mb.push(pos, (0, 0, rz))
    mb.box((1.7 * s, 1.0 * s, 1.4 * s), (0, 0, 0.12), m_body, base=True, bev=0.06)
    mb.cyl(0.52 * s, 0.1 * s, (0, -0.5 * s, 0.9 * s), m_dark, rot=(pi / 2, 0, 0), verts=24, base=False)
    for k in range(1, 6):
        mb.ring(0.5 * s * k / 5.5, 0.5 * s * k / 5.5 - 0.02 * s, 0.05, (0, -0.56 * s, 0.9 * s), m_dark, rot=(pi / 2, 0, 0), seg=20)
    for dx in (-0.55, 0.55):
        mb.box((0.18 * s, 0.9 * s, 0.14 * s), (dx * s, 0, 0.0), m_dark, base=True)
    mb.cyl(0.07 * s, 0.4 * s, (0.5 * s, 0.4 * s, 1.52 * s), m_dark, verts=8)
    mb.pop()

def dish(mb, pos, r, m, m_dark, rz=0.0):
    mb.push(pos, (0, 0, rz))
    mb.cyl(0.08 * r, 0.9 * r, (0, 0, 0), m_dark, verts=8)
    mb.sphere(r, (0, -0.15 * r, 1.2 * r), m, scale=(1, 0.25, 1), sub=2)
    mb.cyl(0.04 * r, 0.9 * r, (0, -0.55 * r, 1.2 * r), m_dark, rot=(pi / 2, 0, 0), verts=6, base=False)
    mb.sphere(0.1 * r, (0, -1.0 * r, 1.2 * r), m_dark, sub=1)
    mb.pop()

def solar_panel(mb, pos, w, d, rz=0.0, tilt=0.45, m_cell='B04_solar', m_frame='white', cols=6, rows=3):
    mb.push(pos, (0, 0, rz))
    mb.box((w, d, 0.08), (0, 0, 0.55), m_frame, rot=(-tilt, 0, 0), bev=0.02, seg=1)
    for i in range(cols):
        for j in range(rows):
            cx = -w / 2 + (i + 0.5) * w / cols; cy = -d / 2 + (j + 0.5) * d / rows
            mb.push((cx, 0, 0.55), (-tilt, 0, 0))
            mb.box((w / cols - 0.06, d / rows - 0.06, 0.04), (0, cy, 0.05), m_cell)
            mb.pop()
    for dx in (-w * 0.4, w * 0.4):
        mb.box((0.07, 0.07, 0.6), (dx, d * 0.25, 0.0), 'steel_dark', base=True)
        mb.box((0.07, 0.07, 0.25), (dx, -d * 0.3, 0.0), 'steel_dark', base=True)
    mb.pop()

def bush(ml, pos, s=1.0, mats=('leaf_a', 'leaf_b', 'leaf_dark'), n=4, seed=0):
    r = random.Random(seed)
    x, y, z = pos
    for i in range(n):
        ml.sphere(0.5 * s * (0.8 + 0.4 * r.random()), (x + (r.random() - 0.5) * 0.9 * s, y + (r.random() - 0.5) * 0.9 * s, z + 0.4 * s + r.random() * 0.2 * s), mats[i % len(mats)], sub=2, scale=(1, 1, 0.85))

def tree2(mt, ml, pos, s=1.0, kind=0, seed=0):
    """richer low-poly tree (more blobs, sub=2, branches)."""
    r = random.Random(seed)
    x, y, z = pos
    mt.cyl(0.25 * s, 1.9 * s, (x, y, z), 'trunk', verts=8, r2=0.18 * s)
    mt.cyl(0.4 * s, 0.25 * s, (x, y, z), 'trunk', verts=8, r2=0.25 * s)
    if kind in (0, 2):
        cols = ('leaf_a', 'leaf_b', 'leaf_dark') if kind == 0 else ('leaf_pink', 'flower_pink', 'leaf_pink')
        for i in range(6):
            a = i * 2 * pi / 6 + r.random()
            rr = 0.9 * s * r.random() + 0.2 * s
            ml.sphere((0.75 + 0.35 * r.random()) * s, (x + cos(a) * rr, y + sin(a) * rr, z + (2.5 + r.random() * 1.2) * s), cols[i % 3], sub=2, scale=(1, 1, 0.9))
        ml.sphere(1.1 * s, (x, y, z + 3.0 * s), cols[0], sub=2)
    else:
        for i in range(5):
            ml.cyl(1.35 * s - i * 0.22 * s, 1.25 * s, (x, y, z + (1.3 + i * 0.8) * s), 'leaf_dark', r2=0.08 * s, verts=10)

def planter(mb, ml, pos, w, d, h=0.7, m='B04_trim', rz=0, seed=0):
    x, y, z = pos
    mb.push((x, y, z), (0, 0, rz))
    mb.box((w, d, h), (0, 0, 0), m, base=True, bev=0.06)
    mb.box((w - 0.25, d - 0.25, 0.08), (0, 0, h), 'trunk', base=False)
    mb.pop()
    r = random.Random(seed)
    n = max(3, int(w * 2))
    for i in range(n):
        px = x + (-w / 2 + 0.2 + (w - 0.4) * i / max(1, n - 1)) * cos(rz)
        py = y + (-w / 2 + 0.2 + (w - 0.4) * i / max(1, n - 1)) * sin(rz)
        ml.sphere(0.28 + 0.12 * r.random(), (px, py, z + h + 0.25), ('leaf_a', 'leaf_b', 'leaf_dark')[i % 3], sub=2)
        if i % 2 == 0:
            ml.sphere(0.09, (px + 0.1, py - 0.1, z + h + 0.55), ('flower_pink', 'flower_yellow')[(i // 2) % 2], sub=1)

def shelf_unit(mb, pos, w, h, d, rz=0.0, levels=4, seed=0, mf='B04_trim', palette=None):
    """gondola shelf stocked with small coloured product boxes/bottles. pos = floor centre."""
    r = random.Random(seed)
    palette = palette or ['B04_prod_a', 'B04_prod_b', 'B04_prod_c', 'B04_prod_d', 'B04_prod_e', 'B04_prod_f']
    mb.push(pos, (0, 0, rz))
    for dx in (-w / 2 + 0.05, w / 2 - 0.05):
        mb.box((0.08, d, h), (dx, 0, 0), mf, base=True, bev=0.015, seg=1)
    mb.box((w, 0.06, h), (0, d / 2 - 0.03, 0), 'steel_dark', base=True)
    for k in range(levels):
        z = 0.15 + k * (h - 0.35) / (levels - 1)
        mb.box((w - 0.1, d, 0.06), (0, 0, z), mf, bev=0.01, seg=1)
        x = -w / 2 + 0.2
        while x < w / 2 - 0.25:
            bw = 0.14 + 0.1 * r.random(); bh = 0.22 + 0.16 * r.random()
            m = palette[r.randrange(len(palette))]
            if r.random() < 0.35:
                mb.cyl(bw * 0.45, bh, (x + bw / 2, -d * 0.12, z + 0.03), m, verts=6)
            else:
                mb.box((bw, d * 0.6, bh), (x + bw / 2, -d * 0.12, z + 0.03), m, base=True)
            x += bw + 0.03
    mb.pop()

def cctv(bld, name, pos, rz=0.0, tilt=0.35, s=1.0, m_body='white', m_dark='steel_dark', m_lens='B05_glow'):
    """dome/bullet camera as its OWN object (origin at mount) so the web can rotate it. returns mb."""
    c = bld.part(name, [m_body, m_dark, m_lens], origin=pos)
    c.push(pos, (0, 0, rz))
    c.box((0.35 * s, 0.35 * s, 0.14 * s), (0, 0, 0.0), m_dark, bev=0.02, seg=1)
    c.cyl(0.07 * s, 0.4 * s, (0, 0, 0.0), m_dark, verts=8)
    c.push((0, -0.05 * s, 0.38 * s), (tilt, 0, 0))
    c.box((0.42 * s, 1.0 * s, 0.38 * s), (0, -0.4 * s, 0), m_body, bev=0.06, seg=2)
    c.box((0.48 * s, 0.35 * s, 0.44 * s), (0, -0.95 * s, 0), m_dark, bev=0.05, seg=1)
    c.cyl(0.13 * s, 0.1 * s, (0, -1.15 * s, 0), m_lens, rot=(pi / 2, 0, 0), verts=14, base=False)
    c.cyl(0.04 * s, 0.05 * s, (0.15 * s, -0.4 * s, 0.2 * s), 'state_incident', verts=6)
    c.pop(); c.pop()
    return c

# ------------------------------------------------------------------ export / verify
def export_glb(code, path):
    import os
    reset_state_visibility(code)
    all_visible()
    bpy.ops.object.select_all(action='DESELECT')
    coll = bpy.data.collections[code]
    for o in coll.all_objects:
        o.select_set(True)
    bpy.context.view_layer.objects.active = bpy.data.objects[code]
    os.makedirs(os.path.dirname(path), exist_ok=True)
    kw = dict(filepath=path, export_format='GLB', use_selection=True, export_yup=True, export_apply=True,
              export_cameras=False, export_lights=False, export_draco_mesh_compression_enable=True,
              export_draco_mesh_compression_level=6)
    try:
        bpy.ops.export_scene.gltf(**kw)
    except TypeError as e:
        print('export kw issue', e)
        kw.pop('export_draco_mesh_compression_level', None)
        bpy.ops.export_scene.gltf(**kw)
    print('exported', path, os.path.getsize(path))

def set_navy_and_floor():
    navy_world()

# ------------------------------------------------------------------ flat (zero-extrude) text: ~1/4 the triangles of MB.text
def _flat_text(s, txt, size, pos, m=None, rot=(pi / 2, 0, 0), depth=0.05, align='CENTER', bold=False):
    cu = bpy.data.curves.new('_t', 'FONT')
    cu.body = txt; cu.size = size; cu.extrude = 0.0; cu.align_x = align; cu.align_y = 'CENTER'
    cu.resolution_u = 2
    ob = bpy.data.objects.new('_t', cu)
    _scratch_coll().objects.link(ob)
    bpy.context.view_layer.update()
    dg = bpy.context.evaluated_depsgraph_get()
    me = bpy.data.meshes.new_from_object(ob.evaluated_get(dg))
    p = Vector(pos)
    me.transform(s._m((p.x, p.y - depth * 0.5, p.z), rot))
    n0 = s._begin()
    s.bm.from_mesh(me)
    s._end(n0, m)
    bpy.data.meshes.remove(me); bpy.data.objects.remove(ob); bpy.data.curves.remove(cu)
MB.text = _flat_text

def cleanup_scene():
    for nm in ('_preview', '_scratch'):
        c = bpy.data.collections.get(nm)
        if c:
            for o in list(c.objects): bpy.data.objects.remove(o, do_unlink=True)
            bpy.data.collections.remove(c)
    for o in list(bpy.data.objects):
        if o.name in ('_pfloor',) or o.name.startswith('_'):
            bpy.data.objects.remove(o, do_unlink=True)

def window2(mb, u, z, w, h, d, rz=0.0, cols=2, rows=2, mf='white', mg='window_warm', c=(0, 0), ft=0.18, depth=0.26, sill=True, arch=False):
    """recessed glowing pane, proud frame, real mullions, header + sill. face frame like common.window."""
    mb.push((c[0], c[1], 0), (0, 0, rz))
    y0 = -(d + 0.02)
    mb.box((w, 0.06, h), (u, y0, z), mg)
    yf = -(d + depth / 2)
    for dx in (-1, 1):
        mb.box((ft, depth, h + ft * 2), (u + dx * (w / 2 + ft / 2), yf, z), mf, bev=0.03, seg=1)
    for dz in (-1, 1):
        mb.box((w + ft * 2, depth, ft), (u, yf, z + dz * (h / 2 + ft / 2)), mf, bev=0.03, seg=1)
    for i in range(1, cols):
        mb.box((0.09, depth * 0.8, h), (u - w / 2 + w * i / cols, -(d + depth * 0.4), z), mf, bev=0.01, seg=1)
    for j in range(1, rows):
        mb.box((w, depth * 0.8, 0.09), (u, -(d + depth * 0.4), z - h / 2 + h * j / rows), mf, bev=0.01, seg=1)
    if sill:
        mb.box((w + 0.6, depth + 0.2, 0.14), (u, -(d + (depth + 0.2) / 2), z - h / 2 - ft - 0.07), mf, bev=0.03, seg=1)
        mb.box((w + 0.5, depth + 0.1, 0.12), (u, -(d + (depth + 0.1) / 2), z + h / 2 + ft + 0.06), mf, bev=0.03, seg=1)
    mb.pop()

# ------------------------------------------------------------------ corrected icon_check (common.icon_check draws an inverted V) + nicer shield outline
SHIELD2 = [(0, .50), (.24, .55), (.46, .47), (.46, .10), (.40, -.10), (.28, -.28), (.13, -.45), (0, -.56),
           (-.13, -.45), (-.28, -.28), (-.40, -.10), (-.46, .10), (-.46, .47), (-.24, .55)]
def icon_check2(mb, pos, k, m, th=0.12):
    x, y, z = pos
    mb.box((0.30 * k, th, 0.10 * k), (x - 0.146 * k, y, z - 0.074 * k), m, rot=(0, 0.785, 0), bev=0.0)
    mb.box((0.62 * k, th, 0.10 * k), (x + 0.172 * k, y, z + 0.032 * k), m, rot=(0, -0.785, 0), bev=0.0)
icon_check = icon_check2
def icon_shield2(mb, pos, k, m_out, m_in=None, th=0.14, rot=(0, 0, 0)):
    mb.prism(SHIELD2, th, pos, m_out, rot, k)
    if m_in:
        mb.prism(SHIELD2, th * 0.6, (pos[0], pos[1] - th * 0.6, pos[2]), m_in, rot, k * 0.78)

# =====================================================================================
# CARTOON helpers (B04/B05). Use with common.py's cartoon preset (cbox, rtree, cperson, clamp_post, cbench, cartoon_preview ...)
# =====================================================================================
def rslab(mb, w, d, h, r, pos, m, rseg=6, bev=0.1, base=True):
    """slab with truly rounded plan-view corners (radius r), bevelled top edge."""
    x, y, z = pos
    pts = []
    for cx, cy, a0 in ((w / 2 - r, d / 2 - r, 0), (-(w / 2 - r), d / 2 - r, pi / 2), (-(w / 2 - r), -(d / 2 - r), pi), (w / 2 - r, -(d / 2 - r), 3 * pi / 2)):
        for i in range(rseg + 1):
            a = a0 + (pi / 2) * i / rseg
            pts.append((cx + r * cos(a), cy + r * sin(a)))
    n0 = mb._begin()
    M = mb._m((x, y, z), (0, 0, 0))
    vs = [mb.bm.verts.new(M @ Vector((px, py, 0))) for px, py in pts]
    f = mb.bm.faces.new(vs)
    res = bmesh.ops.extrude_face_region(mb.bm, geom=[f])
    nv = [e for e in res['geom'] if isinstance(e, bmesh.types.BMVert)]
    bmesh.ops.translate(mb.bm, vec=M.to_3x3() @ Vector((0, 0, h)), verts=nv)
    newf = [q for q in mb.bm.faces if q not in n0]
    bmesh.ops.recalc_face_normals(mb.bm, faces=newf)
    if bev > 0:
        mb._bev(nv, bev, 2)
    mb._end(n0, m)

def prism_b(mb, pts, thick, pos, m=None, rot=(0, 0, 0), scale=1.0, bev=0.08, seg=2):
    """prism (polygon in XZ, extruded along Y) with bevelled edges -> chunky toy look."""
    M = mb._m(pos, rot)
    n0 = mb._begin()
    vs = [mb.bm.verts.new(M @ Vector((x * scale, -thick / 2, z * scale))) for x, z in pts]
    f = mb.bm.faces.new(vs)
    res = mb.bm.faces.ensure_lookup_table()
    res = bmesh.ops.extrude_face_region(mb.bm, geom=[f])
    nv = [e for e in res['geom'] if isinstance(e, bmesh.types.BMVert)]
    bmesh.ops.translate(mb.bm, vec=M.to_3x3() @ Vector((0, thick, 0)), verts=nv)
    newf = [q for q in mb.bm.faces if q not in n0]
    bmesh.ops.recalc_face_normals(mb.bm, faces=newf)
    allv = list({v for q in newf for v in q.verts})
    if bev > 0:
        mb._bev(allv, min(bev, thick * 0.4), seg)
    mb._end(n0, m)

STAR5 = []
for _i in range(10):
    _a = pi / 2 + _i * pi / 5
    _r = 0.5 if _i % 2 == 0 else 0.21
    STAR5.append((cos(_a) * _r, sin(_a) * _r - 0.02))

def cart3d(mb, pos, k, m, m_dark=None, th=0.5):
    """big chunky 3D shopping-cart emblem (faces -Y)."""
    x, y, z = pos
    prism_b(mb, [(-.5, .26), (.5, .26), (.38, -.2), (-.36, -.2)], th, (x, y, z + 0.02 * k), m, scale=k, bev=0.1)
    mb.box((0.34 * k, th, 0.1 * k), (x - 0.6 * k, y, z + 0.34 * k), m, rot=(0, 0.45, 0), bev=0.04, seg=2)
    mb.box((0.18 * k, th, 0.1 * k), (x - 0.46 * k, y, z + 0.4 * k), m, bev=0.04, seg=2)
    mb.box((0.62 * k, th, 0.09 * k), (x - 0.02 * k, y, z - 0.25 * k), m, bev=0.04, seg=2)
    for dx in (-0.22, 0.26):
        mb.cyl(0.1 * k, th * 1.05, (x + dx * k, y, z - 0.42 * k), m, rot=(pi / 2, 0, 0), verts=14, base=False, smooth=True)
    if m_dark:                                           # basket slats
        for dx in (-0.3, -0.1, 0.1, 0.3):
            mb.box((0.04 * k, th * 1.1, 0.34 * k), (x + dx * k, y - 0.02, z + 0.04 * k), m_dark, bev=0.01, seg=1)

def shield3d(mb, pos, k, m_rim, m_band, m_field, m_star, th=0.3):
    """big stacked 3D shield with star (faces -Y). pos = centre."""
    x, y, z = pos
    prism_b(mb, SHIELD2, th, (x, y, z), m_rim, scale=k, bev=0.1)
    prism_b(mb, SHIELD2, th, (x, y - th * 0.7, z), m_band, scale=k * 0.9, bev=0.06)
    prism_b(mb, SHIELD2, th, (x, y - th * 1.4, z), m_field, scale=k * 0.78, bev=0.06)
    if m_star:
        prism_b(mb, STAR5, th * 1.2, (x, y - th * 2.1, z + 0.02 * k), m_star, scale=k * 0.72, bev=0.05)

def tape_line(mb, p0, p1, zs=(1.0, 1.6), h=0.42, thick=0.16, ns=7):
    for z in zs:
        hazard_bar(mb, p0, p1, z, h, thick, ns)

def tape_post(mb, x, y, h=2.0, cap='state_incident'):
    mb.cyl(0.2, h, (x, y, 0.7), 'c_pole_post', verts=8, smooth=True)
    mb.sphere(0.28, (x, y, 0.7 + h + 0.05), cap, sub=2)
    mb.cyl(0.4, 0.2, (x, y, 0.7), 'c_pole_post', verts=10, bev=0.04)

def cwindow(mb, u, z, w, h, d, rz=0.0, cols=2, rows=2, mf='B04_trim', mg='B04_window_glow', c=(0, 0), ft=0.32, depth=0.5, bev=0.1):
    """chunky toy window: fat rounded frame, glowing pane, thick mullions, chunky sill."""
    mb.push((c[0], c[1], 0), (0, 0, rz))
    mb.box((w, 0.12, h), (u, -(d + 0.02), z), mg)
    yf = -(d + depth / 2)
    for dx in (-1, 1):
        mb.box((ft, depth, h + ft * 2), (u + dx * (w / 2 + ft / 2), yf, z), mf, bev=bev, seg=2)
    for dz in (-1, 1):
        mb.box((w + ft * 2, depth, ft), (u, yf, z + dz * (h / 2 + ft / 2)), mf, bev=bev, seg=2)
    for i in range(1, cols):
        mb.box((0.2, depth * 0.8, h), (u - w / 2 + w * i / cols, -(d + depth * 0.4), z), mf, bev=0.05, seg=1)
    for j in range(1, rows):
        mb.box((w, depth * 0.8, 0.2), (u, -(d + depth * 0.4), z - h / 2 + h * j / rows), mf, bev=0.05, seg=1)
    mb.box((w + ft * 2 + 0.5, depth + 0.3, 0.26), (u, -(d + (depth + 0.3) / 2), z - h / 2 - ft - 0.1), mf, bev=0.1, seg=2)
    mb.pop()

def tint_shell(bld, state, name, size, pos, mat, origin=None):
    s_ = bld.sp(state, name, [mat], origin=origin or (0, 0, 0))
    s_.box(size, pos, mat, bev=0.4, seg=3, base=False)
    return s_

def cperson(mb, pos, rz=0.0, shirt='c_shirt_a', s=1.0, hair='c_hair', vest=False):
    return  # NO PEOPLE anywhere (product decision)
    """chunky toy person (fixed proportions; overrides common.cperson): ~1.9 m at s=1."""
    x, y, z = pos
    s = s * 0.9
    mb.push((x, y, z), (0, 0, rz))
    for dx in (-0.15, 0.15):
        mb.cyl(0.15 * s, 0.85 * s, (dx * s, 0, 0), 'c_pants', verts=8, smooth=True)
    mb.box((0.66 * s, 0.42 * s, 0.8 * s), (0, 0, 0.82 * s), 'c_vest' if vest else shirt, base=True, bev=0.13 * s, seg=2)
    for dx in (-1, 1):
        mb.cyl(0.11 * s, 0.7 * s, (dx * 0.42 * s, 0, 0.85 * s), shirt, rot=(0, dx * 0.12, 0), verts=8, smooth=True)
        mb.sphere(0.11 * s, (dx * 0.46 * s, 0, 0.82 * s), 'c_skin', sub=1)
    mb.sphere(0.34 * s, (0, 0, 1.92 * s), 'c_skin', sub=2)
    mb.sphere(0.35 * s, (0, 0.05 * s, 2.02 * s), hair, sub=1, scale=(1, 1, 0.7))
    mb.pop()
