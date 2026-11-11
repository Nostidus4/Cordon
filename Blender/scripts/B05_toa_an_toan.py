# B05 - Toa An Toan (16 x 14 x 14 m) - CARTOON diorama: teal block, big 3D shield+star emblem, white trim, blue glass entrance.
exec(open('/Users/mac/Documents/Cordon/Blender/scripts/common.py').read(), globals())
exec(open('/Users/mac/Documents/Cordon/Blender/scripts/common_B04_B05.py').read(), globals())
PREVIEW = globals().get('PREVIEW', True)
CODE = 'B05'
b = Bld(CODE, 'Tòa An Toàn', '16x14x14', 17.0)
cartoon_materials()
IDN = CMAT('B05_identity', '#00C7C7', rough=0.65)
IDD = CMAT('B05_identity_dark', '#00A3A8', rough=0.7)
TRIM = CMAT('B05_trim', '#F4F8FF', rough=0.6)
GLOW = CMAT('B05_glow', '#39FFF4', '#39FFF4', 2.2, 0.4)
FIELD = CMAT('B05_shield_field', '#0A7F8C', '#12B5BD', 0.5, 0.6)
GLASS = CMAT('B05_window_glass', '#6EC8FF', '#4FB0FF', 0.5, 0.3)
WGLOW = CMAT('B05_window_glow', '#FFC857', '#FFB43A', 1.0, 0.6)
ROOFM = CMAT('B05_roof', '#0B8C95', rough=0.8)
DARK = CMAT('B05_dark', '#26324A', rough=0.7)
PANELBG = CMAT('B05_panel_bg', '#08202A', rough=0.6)
TINT_R = CMAT('B05_tint_incident', '#FF2D3D', '#FF1A2E', 0.7, 0.5, 0.2)
TINT_C = CMAT('B05_tint_recovery', '#5E8FA3', '#58C8D8', 0.5, 0.5, 0.22)
RDIM = CMAT('B05_recovery_dim', '#6C93A8', '#58C8D8', 0.45, 0.7)
GOLD = CMAT('B05_star', '#FFE27A', '#FFD54A', 1.2, 0.5)
WIN_R = CMAT('B05_window_red', '#FF4A55', '#FF2D3D', 1.3, 0.6)
WIN_C = CMAT('B05_window_blue', '#7FA8BC', '#58C8D8', 0.9, 0.6)
CMAT('B05_beam', '#FF2D3D', '#FF1A2E', 1.5, 0.5, 0.3)

def P(name, mats=None): return b.part(name, mats or [])
XW, YF, YB = 8.0, -2.0, 7.0
YC = (YF + YB) / 2
ZF, ZW, ZR = 0.9, 12.4, 13.2
CZ = 8.2
SHY = YF - 0.3

pl = P('plot')
rslab(pl, 22, 20, 0.5, 3.4, (0, 0, 0), 'c_curb', 7, 0.18)
rslab(pl, 20.4, 18.4, 0.2, 2.7, (0, 0, 0.5), 'c_sidewalk', 7, 0.08)
rslab(pl, 19.2, 17.2, 0.1, 2.3, (0, 0, 0.7), 'c_lawn', 7, 0.04)
pz = P('plaza', ['c_paver', 'c_curb'])
pz.box((9.0, 6.0, 0.14), (0, -7.0, 0.8), 'c_paver', base=True, bev=0.07, seg=2)
for i in range(3): pz.box((2.6, 0.5, 0.2 - i * 0.05), (0, -4.6 - i * 0.55, 0.8), 'c_curb', base=True, bev=0.05, seg=1) if False else None

bd = P('body')
bd.box((16, YB - YF, ZW - ZF), (0, YC, ZF), 'B05_identity', base=True, bev=0.45, seg=3)
bd.box((16.6, YB - YF + 0.6, 0.8), (0, YC, ZF), 'B05_trim', base=True, bev=0.25, seg=3)
bd.box((16.6, YB - YF + 0.6, 0.6), (0, YC, 5.0), 'B05_trim', base=True, bev=0.22, seg=3)
for sx in (-1, 1):
    for yy in (YF + 0.1, YB - 0.1):
        bd.box((1.0, 1.0, ZW - ZF - 0.1), (sx * 7.9, yy, ZF + 0.05), 'B05_trim', base=True, bev=0.3, seg=3)
rf = P('roof')
rf.box((17.6, YB - YF + 1.6, ZR - ZW), (0, YC, ZW), 'B05_trim', base=True, bev=0.35, seg=3)
rf.box((15.6, YB - YF - 0.4, 0.3), (0, YC, ZR), 'B05_roof', base=True, bev=0.1, seg=2)
rf.box((17.6, 0.55, 0.5), (0, YF - 0.7, ZR), 'B05_trim', base=True, bev=0.2, seg=2)
rf.box((17.6, 0.55, 0.5), (0, YB + 0.7, ZR), 'B05_trim', base=True, bev=0.2, seg=2)
for sx in (-1, 1): rf.box((0.55, YB - YF + 1.6, 0.5), (sx * 8.5, YC, ZR), 'B05_trim', base=True, bev=0.2, seg=2)
rf.box((4.4, 3.4, 1.8), (2.6, 4.0, ZR), 'B05_trim', base=True, bev=0.4, seg=3)

WINS = []
for sx in (-1, 1):
    for z in (3.0, 7.2, 10.4):
        if z > 6 : WINS.append((sx * 5.6, z, 2.2, 2.0, -YF, 0.0, (0, 0)))
for y in (-0.5, 3.0, 6.0):
    for z in (3.0, 7.2, 10.4):
        WINS.append((y - YC, z, 2.0, 2.0, XW, pi / 2, (0, YC)))
        WINS.append((-(y - YC), z, 2.0, 2.0, XW, -pi / 2, (0, YC)))
win = P('windows', [TRIM, WGLOW])
for (u, z, w, h, d, rz, c) in WINS:
    cwindow(win, u, z, w, h, d, rz, 2, 2, 'B05_trim', 'B05_window_glow', c, ft=0.28, depth=0.45)

# entrance: glass lobby + canopy + columns
lb = P('entrance', ['B05_window_glass', 'B05_trim', 'B05_dark', 'B05_glow'])
lb.box((7.6, 0.2, 3.6), (0, YF - 0.05, ZF + 0.1), 'B05_window_glass', base=True, bev=0.05, seg=1)
box_frame(lb, (0, 2.9), 7.8, 3.8, 0.3, 'B05_trim', y=YF - 0.25, d=0.4, bev=0.1)
for x in (-1.9, 1.9, 0): lb.box((0.2, 0.3, 3.6), (x, YF - 0.3, ZF + 0.1), 'B05_dark', base=True)
lb.box((7.4, 0.3, 0.2), (0, YF - 0.3, 3.2), 'B05_dark')
lb.box((8.8, 2.6, 0.5), (0, YF - 1.5, 5.0), 'B05_trim', bev=0.22, seg=3)
lb.box((8.4, 0.18, 0.18), (0, YF - 2.85, 5.0), 'B05_glow')
for x in (-3.8, 3.8): lb.cyl(0.4, 4.0, (x, YF - 2.5, ZF), 'B05_trim', verts=16, smooth=True)
lb.box((4.6, 1.6, 0.35), (0, YF - 1.8, ZF), 'B05_trim', base=True, bev=0.12, seg=2)

# BIG 3D shield + star emblem
sh = P('shield_logo', [TRIM, GLOW, FIELD, GOLD])
shield3d(sh, (0, SHY - 0.3, CZ), 7.4, 'B05_trim', 'B05_glow', 'B05_shield_field', 'B05_star', 0.35)
sh.box((8.4, 0.5, 7.6), (0, YF + 0.0, CZ), 'B05_identity_dark', bev=0.4, seg=3) if False else None

lp = P('lamps')
for p in ((-10.2, -5.0), (10.2, -5.0), (-10.2, 7.0), (10.2, 7.0)): clamp_post(lp, (p[0], p[1], 0.5), 3.4)
bn = P('benches'); cbench(bn, (-7.0, -9.1, 0.9), pi); cbench(bn, (7.0, -9.1, 0.9), pi)
tr_t = P('trees_trunk', ['c_trunk']); tr_l = P('trees_leaf', ['c_leaf_a', 'c_leaf_b', 'c_leaf_c', 'c_leaf_pink', 'flower_pink'])
for (x, y, k, s) in ((-9.6, -8.8, 0, 0.8), (9.6, -8.8, 2, 0.8), (-10.2, 1.4, 0, 0.75), (10.2, 1.4, 0, 0.75), (-8.8, 9.3, 2, 0.8), (8.8, 9.3, 0, 0.8)):
    rtree(tr_t, tr_l, (x, y, 0.8), s, k)
pe = P('people', ['c_pants', 'c_skin', 'c_hair', 'c_shirt_a', 'c_shirt_b', 'c_shirt_c', 'c_shirt_d', 'c_vest'])
cperson(pe, (-2.6, -7.0, 0.94), 0.3, 'c_shirt_b', 1.15); cperson(pe, (3.0, -8.2, 0.94), 3.0, 'c_shirt_a', 1.15); cperson(pe, (0.4, -9.0, 0.94), 3.6, 'c_vest', 1.1, vest=True)
cm = P('cameras', ['B05_trim', 'B05_dark', 'B05_glow'])
for sx in (-1, 1):
    cctv(b, 'camera_' + ('L' if sx < 0 else 'R'), (sx * 7.6, YF - 0.5, 11.6), pi * 0.75 * sx * -1 + (pi if False else 0), 0.5, 1.5, 'white', 'steel_dark', 'B05_glow')
gl = P('glow_trim', ['B05_glow'])
gl.box((17.2, 0.14, 0.14), (0, YF - 1.05, ZR + 0.52), 'B05_glow')
for sx in (-1, 1): gl.box((0.14, YB - YF + 1.4, 0.14), (sx * 8.85, YC, ZR + 0.52), 'B05_glow')

def plot_ring(state, mat):
    r = b.sp(state, 'plot_ring', [mat], origin=(0, 0, 0.5)); rslab(r, 21.5, 19.5, 0.1, 3.2, (0, 0, 0.5), mat, 7, 0.0)
def pane_overlay(mb, mat, th=0.05):
    for (u, z, w, h, d, rz, c) in WINS:
        mb.push((c[0], c[1], 0), (0, 0, rz)); mb.box((w, th, h), (u, -(d + 0.14), z), mat); mb.pop()
def siren(state, name, pos, r, mat):
    x, y, z = pos
    o = b.sp(state, name, [mat, 'steel_dark'], origin=(x, y, z + r * 0.8))
    o.cyl(r * 1.3, r * 0.7, (x, y, z), 'steel_dark', verts=14, bev=0.06, smooth=True)
    o.uvsphere(r, (x, y, z + r * 0.7), mat, scale=(1, 1, 1.15), u=14, v=9)
def shield_state(state, rim, field, glyph_fn):
    s_ = b.sp(state, 'shield', [rim, field, 'B05_trim', 'hazard_black', 'steel_dark'], origin=(0, SHY - 0.9, CZ))
    prism_b(s_, SHIELD2, 0.35, (0, SHY - 0.95, CZ), rim, scale=7.0, bev=0.1)
    prism_b(s_, SHIELD2, 0.35, (0, SHY - 1.4, CZ), field, scale=6.1, bev=0.06)
    glyph_fn(s_)
def trim_edges(state, mat):
    t = b.sp(state, 'edge_trim', [mat])
    t.box((17.2, 0.18, 0.18), (0, YF - 1.05, ZR + 0.56), mat)
    for sx in (-1, 1): t.box((0.18, YB - YF + 1.4, 0.18), (sx * 8.85, YC, ZR + 0.56), mat)
    t.box((8.4, 0.2, 0.2), (0, YF - 2.85, 5.1), mat)
def tint(state, mat): tint_shell(b, state, 'tint_glow', (16.6, YB - YF + 0.6, ZW - ZF + 0.2), (0, YC, (ZF + ZW) / 2), mat)

# normal
nr = b.sp('normal', 'shield_ring', ['B05_glow'], origin=(0, SHY - 1.0, CZ))
nr.ring(4.6, 4.4, 0.12, (0, SHY - 1.0, CZ), 'B05_glow', rot=(pi / 2, 0, 0), seg=64)
siren('normal', 'status_beacon', (-5.0, 3.0, ZR + 0.3), 0.55, 'state_ok')
plot_ring('normal', 'B05_glow')
glow_ring(b, 'normal', 'scan_ring', (0, -7.0, 0.95), 3.2, 3.05, 'B05_glow', 0.06, 48)

# warning
shield_state('warning', 'state_warning', 'B05_panel_bg', lambda s_: icon_warn(s_, (0, SHY - 1.8, CZ + 0.1), 4.4, 'state_warning', 'hazard_black', 0.4))
siren('warning', 'beacon_L', (-5.0, 3.0, ZR + 0.3), 0.7, 'state_warning'); siren('warning', 'beacon_R', (5.0, 1.0, ZR + 0.3), 0.7, 'state_warning')
glow_ring(b, 'warning', 'scan_ring', (0, -7.0, 0.95), 5.2, 5.0, 'state_warning', 0.08, 64)
glow_ring(b, 'warning', 'scan_ring_wide', (0, -7.0, 0.97), 7.6, 7.4, 'state_warning', 0.08, 64)
trim_edges('warning', 'state_warning'); plot_ring('warning', 'state_warning')
wp = b.sp('warning', 'login_popup', ['B05_panel_bg', 'state_warning', 'steel_dark', 'B05_trim'], origin=(6.4, -7.0, 4.6))
wp.box((3.6, 0.3, 2.4), (6.4, -7.0, 4.6), 'B05_panel_bg', bev=0.35, seg=3)
box_frame(wp, (6.4, 4.6), 3.6, 2.4, 0.2, 'state_warning', y=-7.2, d=0.22, bev=0.08)
icon_warn(wp, (6.4, -7.3, 4.6), 1.5, 'state_warning')
wp.box((0.16, 0.16, 3.4), (6.4, -7.0, 0.9), 'state_warning')

# incident
tint('incident', 'B05_tint_incident')
pane_overlay(b.sp('incident', 'window_glow', ['B05_window_red']), 'B05_window_red')
shield_state('incident', 'state_incident', 'B05_panel_bg', lambda s_: icon_x(s_, (0, SHY - 1.8, CZ + 0.1), 4.6, 'state_incident', 0.4))
siren('incident', 'siren_beacon', (-5.0, 3.0, ZR + 0.3), 1.0, 'state_incident')
siren('incident', 'siren_beacon_R', (5.0, 1.0, ZR + 0.3), 0.8, 'state_incident')
for x in (-10.3, 10.3): siren('incident', 'lamp_beacon_' + ('L' if x < 0 else 'R'), (x, -9.4, 0.7), 0.5, 'state_incident')
tb = b.sp('incident', 'barrier_gate', ['hazard_yellow', 'hazard_black', 'state_incident', 'c_pole_post'])
for x in (-4.6, 4.6): tape_post(tb, x, YF - 3.6, 2.4)
tape_line(tb, (-4.6, YF - 3.6), (4.6, YF - 3.6), (1.0, 1.7), 0.5, 0.2, 9)
PTS = [(-10.3, -9.4), (-5.2, -9.4), (0.0, -9.4), (5.2, -9.4), (10.3, -9.4)]
for (x, y) in PTS: tape_post(tb, x, y)
for a_, b_ in zip(PTS[:-1], PTS[1:]): tape_line(tb, a_, b_)
for sx in (-1, 1):
    for y in (-4.2, 0.6): tape_post(tb, sx * 10.3, y)
    for a_, b_ in (((sx * 10.3, -9.4), (sx * 10.3, -4.2)), ((sx * 10.3, -4.2), (sx * 10.3, 0.6))): tape_line(tb, a_, b_)
plot_ring('incident', 'state_incident'); trim_edges('incident', 'state_incident')
for sx in (-1, 1):
    P0 = Vector((sx * 7.6, YF - 0.5, 11.2)); T = Vector((sx * 3.0, -8.5, 0.9)); d = T - P0
    bm_ = b.sp('incident', 'camera_beam_' + ('L' if sx < 0 else 'R'), ['B05_beam'], origin=tuple(P0))
    bm_.cyl(0.1, d.length, tuple(P0 + d / 2), 'B05_beam', rot=tuple(Vector((0, 0, 1)).rotation_difference(d.normalized()).to_euler()), verts=14, r2=2.0, base=False)

# recovery
tint('recovery', 'B05_tint_recovery')
pane_overlay(b.sp('recovery', 'window_glow', ['B05_window_blue']), 'B05_window_blue')
shield_state('recovery', 'state_recovery', 'B05_recovery_dim', lambda s_: icon_lock(s_, (0, SHY - 1.8, CZ + 0.1), 3.6, 'B05_trim', 'steel_dark', 0.4))
rpn = b.sp('recovery', 'progress_panel', ['B05_panel_bg', 'state_recovery', 'steel_dark'])
rpn.box((5.4, 0.35, 1.7), (-5.2, -6.2, 4.6), 'B05_panel_bg', bev=0.4, seg=3)
box_frame(rpn, (-5.2, 4.6), 5.4, 1.7, 0.18, 'state_recovery', y=-6.42, d=0.22, bev=0.07)
for sx in (-1, 1): rpn.box((0.14, 0.14, 3.0), (-5.2 + sx * 2.3, -6.2, 0.95), 'steel_dark')
progress_bar(b, 'recovery', 'progress', (-4.6, -6.55, 4.6), 3.4, 0.55, 0.6, 'steel_dark', 'state_recovery', 0.24)
rck = b.sp('recovery', 'checklist_panel', ['B05_panel_bg', 'state_recovery', 'steel_dark', 'B05_trim'])
rck.box((3.6, 0.3, 3.2), (5.8, -6.6, 2.9), 'B05_panel_bg', bev=0.35, seg=3)
box_frame(rck, (5.8, 2.9), 3.6, 3.2, 0.16, 'state_recovery', y=-6.78, d=0.2, bev=0.06)
for i in range(3):
    z = 3.8 - i * 0.95
    rck.box((0.55, 0.12, 0.55), (4.7, -6.85, z), 'state_recovery' if i < 2 else 'steel_dark', bev=0.1, seg=2)
    if i < 2: icon_check(rck, (4.7, -6.95, z), 0.75, 'B05_trim', 0.1)
    rck.box((1.6 - i * 0.3, 0.1, 0.22), (6.1, -6.85, z), 'state_recovery' if i < 2 else 'steel_dark', bev=0.05, seg=2)
rck.box((0.14, 0.14, 1.9), (4.4, -6.6, 0.95), 'steel_dark'); rck.box((0.14, 0.14, 1.9), (7.2, -6.6, 0.95), 'steel_dark')
glow_ring(b, 'recovery', 'isolation_ring', (0, -7.0, 0.95), 5.6, 5.4, 'state_recovery', 0.1, 64)
plot_ring('recovery', 'state_recovery'); trim_edges('recovery', 'state_recovery')
total = b.finish(); bpy.context.view_layer.update()
print(CODE, 'tris', total, 'objs', len(b.coll.objects))
if PREVIEW:
    kw = dict(center=(0, 0, 6.0), scale=34, size=(1200, 900), az=-35, elev=32)
    kw.update(globals().get('CAM', {}))
    cartoon_preview(CODE, states=globals().get('PREVIEW_STATES', ('normal', 'warning', 'incident', 'recovery')), **kw)
if globals().get('EXPORT', True):
    reset_state_visibility(CODE); all_visible(); cleanup_scene()
    bpy.ops.wm.save_as_mainfile(filepath=f'{PROJ}/out/{CODE}.blend')
    export_glb(CODE, '/Users/mac/Documents/Cordon/Frontend/public/models/city/B05.glb')
if globals().get('TOPN'):
    L = sorted(((tris(o), o.name) for o in b.coll.all_objects), reverse=True)
    for t, nme in L[:TOPN]: print('TOP', t, nme)
    print('STATE tris', {s: sum(tris(o) for o in b.st[s].children_recursive) for s in STATES})
