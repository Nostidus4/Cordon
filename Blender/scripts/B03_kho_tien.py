# B03 - Kho tien (16 x 16 x 14 m) - CARTOON/toy version (REF_07/REF_08). Chunky cyan-blue vault cube, big golden wheel door,
# coin stack, raised roof cap + beacon. Plot 22 x 20.
exec(open('/Users/mac/Documents/Cordon/Blender/scripts/common_B02_B03.py').read(), globals())
PREVIEW = globals().get('PREVIEW', True)
EXPORT = globals().get('EXPORT', True)
CODE = 'B03'
fresh_scene()
b = Bld(CODE, 'Kho tiền', '16x16x14', 17.0)
cartoon_materials()

IDN = 'B03_identity'; CMAT(IDN, '#0A84D8', rough=0.6)
CMAT('B03_glow', '#00E5FF', '#00E5FF', 3.2, rough=0.4); GLN = 'B03_glow'
CMAT('B03_panel', '#2AA3F5', rough=0.6); PAN = 'B03_panel'
CMAT('B03_deep', '#0A4FB3', rough=0.6); DEEP = 'B03_deep'
CMAT('B03_steel', '#B9C8DA', rough=0.55); ST = 'B03_steel'
CMAT('B03_steel_dark', '#4B5C7A', rough=0.6); STD = 'B03_steel_dark'
CMAT('B03_gold', '#FFC400', '#FF9E00', 0.25, rough=0.45); GD = 'B03_gold'
CMAT('B03_roof', '#CFEFFF', rough=0.6); RF = 'B03_roof'
CMAT('B03_screen', '#04243F', '#0A5A8A', 0.5, rough=0.4); SCR = 'B03_screen'
CMAT('B03_green_glow', '#22E08A', '#22E08A', 3.0, rough=0.4); GG = 'B03_green_glow'
CMAT('B03_window_glass', '#8FD8FF', '#2E9BE0', 0.4, rough=0.15, alpha=0.4)
DOME = CMAT('B03_dome', '#58C8D8', '#58C8D8', 0.5, rough=0.2, alpha=0.12)
TINT_W = CMAT('B03_tint_warning', '#FFB300', '#FFB300', 0.9, rough=0.5, alpha=0.2)
TINT_I = CMAT('B03_tint_incident', '#FF2D3D', '#FF2D3D', 1.0, rough=0.5, alpha=0.26)
TINT_R = CMAT('B03_tint_recovery', '#8FA9BD', '#58C8D8', 0.35, rough=0.5, alpha=0.50)

GZ = 1.15; BZ = 1.65; BT = 13.0; HX = 7.5; FY = -HX
DX, DZ = 0.9, 6.2       # vault door centre

g = b.part('plot', ['c_curb', 'c_sidewalk', 'c_lawn', 'c_paver', GLN])
cplot(g, 0, 0, 22, 20, 0.0, curb=0.5, walk=0.5)
g.box((5.0, 1.2, 0.1), (DX, -9.5, 0.9), 'c_paver', base=True, bev=0.06, seg=2)
for sx in (-1, 1):
    g.box((0.12, 9.0, 0.06), (sx * 9.9, 0, 0.9), GLN, base=True)

# ------------------------------------------------------------------ cube
sh = b.part('shell', [IDN, PAN, ST, STD, GLN, DEEP])
sh.box((16.6, 16.6, 0.5), (0, 0, GZ), ST, base=True, bev=0.2, seg=3)
cbox(sh, (15.0, 15.0, BT - BZ), (0, 0, BZ), IDN, base=True, bev=0.45, seg=4)
for sx in (-1, 1):                                   # big raised side panels
    cbox(sh, (0.5, 11.0, 9.0), (sx * 7.6, 0, 6.2), PAN, bev=0.22, seg=3)
cbox(sh, (11.0, 0.5, 4.0), (-1.4, 7.6, 7.5), PAN, bev=0.22, seg=3)
cbox(sh, (15.6, 15.6, 0.7), (0, 0, BT - 0.35), ST, bev=0.3)                 # top belt
cbox(sh, (15.6, 15.6, 0.7), (0, 0, BZ + 0.2), ST, bev=0.3)                  # bottom belt
for sx in (-1, 1):
    for sy in (-1, 1):
        sh.cyl(0.5, BT - BZ - 0.2, (sx * 7.4, sy * 7.4, BZ), ST, verts=10, bev=0.0, smooth=True)
# roof cap
cbox(sh, (16.2, 16.2, 0.8), (0, 0, BT + 0.3), ST, bev=0.3)
cbox(sh, (12.6, 12.6, 0.9), (0, 0, BT + 1.0), RF, bev=0.35, seg=4)
for sx in (-1, 1):
    sh.box((0.12, 14.0, 0.1), (sx * 8.1, 0, BT + 0.75), GLN)
    sh.box((14.0, 0.12, 0.1), (0, sx * 8.1, BT + 0.75), GLN)
    sh.box((0.12, 11.5, 0.1), (sx * 6.3, 0, BT + 1.95), GLN)
    sh.box((11.5, 0.12, 0.1), (0, sx * 6.3, BT + 1.95), GLN)
sh.box((15.4, 0.1, 0.1), (0, FY - 0.55, BT - 0.9), GLN)
for sx in (-1, 1):
    sh.box((0.1, 0.1, 10.6), (sx * 7.9, FY - 0.3, BZ + 0.6), GLN, base=True)

# ------------------------------------------------------------------ vault door + wheel
Y0 = FY
dh = b.part('door_housing', [ST, DEEP, STD, GLN])
rplate(dh, 8.4, 8.4, 0.6, (DX, Y0 - 0.2, DZ), ST, r=1.8, seg=5)
rplate(dh, 7.6, 7.6, 0.4, (DX, Y0 - 0.55, DZ), DEEP, r=1.6, seg=5)
for dx in (-1, 1):
    for dz in (-1, 1):
        dh.sphere(0.32, (DX + dx * 3.3, Y0 - 0.85, DZ + dz * 3.3), ST, sub=2)
dd = b.part('door_disc', [ST, STD, GLN, GD], origin=(DX + 3.5, Y0 - 1.0, DZ))
dd.cyl(3.15, 0.8, (DX, Y0 - 1.3, DZ), ST, rot=(pi / 2, 0, 0), verts=36, base=False, smooth=True)
dd.ring(3.3, 2.9, 0.9, (DX, Y0 - 1.3, DZ), STD, rot=(pi / 2, 0, 0), seg=36)
dd.ring(2.55, 2.4, 0.12, (DX, Y0 - 1.78, DZ), GLN, rot=(pi / 2, 0, 0), seg=36)
for i in range(8):
    a = 2 * pi * i / 8 + pi / 8
    dd.sphere(0.2, (DX + cos(a) * 2.7, Y0 - 1.8, DZ + sin(a) * 2.7), GD, sub=1)
wh = b.part('door_wheel', [GD, ST], origin=(DX, Y0 - 2.1, DZ))
spoke_wheel(wh, (DX, Y0 - 2.1, DZ), 2.0, 6, GD, GD, GD, th=0.5, handles=True, m_knob=GD, seg=32)
wh.cyl(0.6, 0.4, (DX, Y0 - 2.4, DZ), GD, rot=(pi / 2, 0, 0), verts=16, base=False, smooth=True)
hg = b.part('hinge', [ST, STD])
for z in (DZ - 2.4, DZ, DZ + 2.4):
    hg.cyl(0.5, 1.5, (DX + 4.3, Y0 - 0.9, z - 0.75), ST, verts=12, smooth=True)
    hg.cyl(0.55, 0.2, (DX + 4.3, Y0 - 0.9, z - 0.78), STD, verts=12)
# dashboard screen left of door
db = b.part('dashboard_frame', [ST, DEEP, SCR, GLN])
DBX, DBZ = -4.6, 7.0
rplate(db, 4.6, 5.4, 0.5, (DBX, Y0 - 0.2, DBZ), ST, r=1.0, seg=4)
rplate(db, 4.0, 4.8, 0.3, (DBX, Y0 - 0.5, DBZ), DEEP, r=0.8, seg=4)
rplate(db, 3.6, 4.4, 0.2, (DBX, Y0 - 0.7, DBZ), SCR, r=0.6, seg=4)
# sign band (one short label)
sb = b.part('sign', [DEEP, GLN])
cbox(sb, (9.0, 0.5, 1.9), (-3.0, Y0 - 0.2, 11.3), DEEP, bev=0.3)
sb.text('KHO TIỀN', 1.0, (-3.0, Y0 - 0.55, 11.3), GLN, depth=0.1)
# coin stack + gold bars next to door
cs = b.part('coin_stack', [GD, 'B03_coin_edge', ST])
CMAT('B03_coin_edge', '#E09A00', rough=0.5)
for (cx, cy, n, r) in ((5.6, -9.4, 5, 0.95), (7.0, -9.0, 3, 0.8), (4.3, -9.0, 2, 0.75)):
    for i in range(n):
        cs.cyl(r, 0.34, (cx, cy, 1.15 + i * 0.38), GD, verts=18, smooth=True)
        cs.cyl(r * 1.04, 0.1, (cx, cy, 1.15 + i * 0.38 + 0.12), 'B03_coin_edge', verts=18)

# ------------------------------------------------------------------ chunky vent on +X side, gate
vt = b.part('vent', [ST, STD, DEEP])
cbox(vt, (0.5, 4.6, 3.6), (HX + 0.2, 1.5, 7.6), DEEP, bev=0.2)
for i in range(5):
    vt.box((0.3, 3.8, 0.3), (HX + 0.55, 1.5, 6.4 + i * 0.58), ST, bev=0.1, seg=2)
gt = b.part('gate', [ST, STD, GLN, GG, SCR])
GY = -9.2
for sx in (-1, 1):
    cbox(gt, (1.1, 1.1, 2.4), (-5.0 + sx * 2.2 - 1.6, GY, 0.9), ST, base=True, bev=0.3, seg=3)
cbox(gt, (5.6, 0.9, 0.5), (-6.6, GY, 3.1), ST, bev=0.2)
gt.box((5.0, 0.1, 0.1), (-6.6, GY - 0.5, 3.1), GLN)

# ------------------------------------------------------------------ props
pr = b.part('props', ['c_pole_post', 'c_lamp_glow', 'c_bench', 'c_pants', 'c_skin', 'c_hair', 'c_shirt_a', 'c_shirt_b', 'c_shirt_c', 'c_shirt_d', 'c_vest', 'c_bush', 'flower_pink', 'flower_yellow', ST])
for p in ((-9.9, -9.2), (9.9, -9.2), (-9.9, 8.8), (9.9, 8.8)):
    clamp_post(pr, (p[0], p[1], 0.9), 3.4)
cbench(pr, (-7.6, -9.45, 0.9), 0)
cbench(pr, (9.4, 3.0, 0.9), pi / 2)
cperson(pr, (-1.8, -9.6, 0.9), pi, 'c_shirt_b'); cperson(pr, (2.9, -9.8, 0.9), pi, 'c_shirt_a'); cperson(pr, (-3.4, -8.8, GZ), pi * 0.8, 'c_shirt_c', 0.9)
cperson(pr, (0.2, -8.7, GZ), pi, 'c_shirt_d', 0.95)
tt = b.part('trees_trunk', ['c_trunk']); tl = b.part('trees_leaf', ['c_leaf_a', 'c_leaf_b', 'c_leaf_c', 'c_leaf_pink', 'flower_pink'])
for (x, y, k, s) in ((-9.9, -4.2, 0, 0.8), (9.9, -5.5, 0, 0.8), (-9.9, 2.0, 0, 0.85), (9.9, 8.0, 2, 0.8), (-9.8, 7.0, 0, 0.8),
                     (-4.5, 9.3, 0, 0.7), (4.5, 9.3, 1, 0.7), (-9.8, -8.0, 1, 0.7), (9.8, -9.0, 0, 0.7)):
    rtree(tt, tl, (x, y, 0.9), s, k)

# ------------------------------------------------------------------ STATES
def ring(state, mat, name='ring', hw=10.2, yf=-9.55):
    r = b.sp(state, name, [mat], origin=(0, 0, 1.0))
    r.box((2 * hw, 0.3, 0.12), (0, yf, 0.95), mat, base=True)
    r.box((2 * hw, 0.3, 0.12), (0, -yf + 0.2, 0.95), mat, base=True)
    for sx in (-1, 1):
        r.box((0.3, 2 * -yf + 0.5, 0.12), (sx * hw, 0.1, 0.95), mat, base=True)
def dash_rect(mb, h, rot=(0, 0, 0)):
    pass
def tint(state, mat):
    t = b.sp(state, 'building_tint', [mat])
    cbox(t, (16.2, 16.2, BT - BZ + 0.1), (0, 0, BZ - 0.05), mat, base=True, bev=0.45, seg=4)
def dash_icons(state, mat, kind):
    m = b.sp(state, 'dashboard', [mat, 'white'])
    x, z = DBX, DBZ
    if kind == 'ok':
        bar_chart(m, (x, Y0 - 0.85, z - 0.2), 2.8, 2.4, (0.35, 0.55, 0.45, 0.7, 0.9), mat, 0.15)
        ccheck(m, (x, Y0 - 0.9, z + 1.8), 0.8, mat, 0.15)
    elif kind == 'warn':
        bar_chart(m, (x, Y0 - 0.85, z - 0.3), 2.8, 2.0, (0.4, 0.6, 0.55, 0.85, 1.0), mat, 0.15)
        icon_warn(m, (x, Y0 - 0.9, z + 1.6), 0.9, mat)
    elif kind == 'lock':
        icon_lock(m, (x, Y0 - 0.9, z), 3.0, mat)
    else:
        icon_shield(m, (x, Y0 - 0.9, z + 0.2), 3.4, mat, STD, 0.2)
        ccheck(m, (x, Y0 - 1.1, z + 0.25), 1.5, 'white', 0.2)

# NORMAL
dash_icons('normal', GG, 'ok')
nb = csiren(b, 'normal', 'beacon', (5.6, -5.6, BT + 1.9), 0.8, GG)
ring('normal', GG)
nr = b.sp('normal', 'wheel_ring', [GG], origin=(DX, Y0 - 1.8, DZ))
nr.ring(3.6, 3.45, 0.14, (DX, Y0 - 1.0, DZ), GG, rot=(pi / 2, 0, 0), seg=40)
ng = b.sp('normal', 'gate_arrows', [GG])
icon_exchange(ng, (-6.6, GY - 0.6, 3.1), 1.4, GG, 0.15)

# WARNING
dash_icons('warning', 'state_warning', 'warn')
csiren(b, 'warning', 'beacon', (5.6, -5.6, BT + 1.9), 0.9, 'state_warning')
ring('warning', 'state_warning')
wr = b.sp('warning', 'wheel_ring', ['state_warning'], origin=(DX, Y0 - 1.8, DZ))
wr.ring(3.6, 3.45, 0.14, (DX, Y0 - 1.0, DZ), 'state_warning', rot=(pi / 2, 0, 0), seg=40)
def warn_icon(mb, p):
    icon_warn(mb, (p[0], p[1], p[2]), 2.4, 'state_warning')
float_sign(b, 'warning', 'limit_sign', (-8.2, -8.0, GZ), 4.0, 3.4, 'hazard_yellow', warn_icon, 'hazard_black', rz=0.45)
ws = b.sp('warning', 'limit_text', ['state_warning'])
ws.text('92% HẠN MỨC', 0.6, (-7.1, -8.7, GZ + 4.1), 'state_warning', depth=0.06, rot=(pi / 2, 0, 0.45))
tint('warning', TINT_W)

# INCIDENT
dash_icons('incident', 'state_incident', 'lock')
csiren(b, 'incident', 'beacon_L', (-5.6, -5.6, BT + 1.9), 1.0, 'state_incident')
csiren(b, 'incident', 'beacon_R', (5.6, 5.6, BT + 1.9), 1.0, 'state_incident')
csiren(b, 'incident', 'beacon_F', (5.6, -5.6, BT + 1.9), 1.0, 'state_incident')
caution_barrier(b, 'incident', 'barrier', [(-6.0, -9.9), (-2.4, -10.0), (3.4, -10.0), (7.4, -9.9)], 0.9, 1.9)
ring('incident', 'state_incident')
def lock_icon(mb, p):
    x, y, z = p
    mb.box((1.8, 0.3, 1.3), (x, y - 0.05, z - 0.5), 'state_incident', bev=0.18, seg=3)
    mb.ring(0.6, 0.35, 0.3, (x, y - 0.05, z + 0.3), 'state_incident', rot=(pi / 2, 0, 0), seg=14, arc=pi, a0=0)
float_sign(b, 'incident', 'lock_sign', (-8.4, -7.8, GZ), 4.2, 3.6, 'hazard_black', lock_icon, 'screen_dark', rz=0.45)
ik = b.sp('incident', 'door_lock', ['state_incident', 'hazard_black', 'hazard_yellow'])
hazard_bar(ik, (DX - 3.6, Y0 - 2.6), (DX + 3.6, Y0 - 2.6), DZ + 0.0, 0.8, 0.3, 9)
ik.ring(3.6, 3.4, 0.2, (DX, Y0 - 1.0, DZ), 'state_incident', rot=(pi / 2, 0, 0), seg=40)
ik2 = b.sp('incident', 'tx_line', ['state_incident'])
ik2.box((0.6, 7.0, 0.1), (DX, -6.2, 0.95), 'state_incident', base=True)
ik2.box((10.0, 0.6, 0.1), (-4.0, -8.2, 0.95), 'state_incident', base=True)
tint('incident', TINT_I)

# RECOVERY
dash_icons('recovery', 'state_recovery', 'shield')
sh_ = b.sp('recovery', 'door_shield', ['state_recovery', 'steel_dark', 'white', 'B03_deep'], origin=(DX, Y0 - 2.6, DZ + 4.8))
sh_.prism(SHIELD, 0.5, (DX, Y0 - 3.0, DZ + 5.4), 'state_recovery', scale=2.4)
sh_.prism(SHIELD, 0.3, (DX, Y0 - 3.35, DZ + 5.4), 'steel_dark', scale=1.8)
ccheck(sh_, (DX, Y0 - 3.6, DZ + 5.45), 1.6, 'white', 0.25)
dm = b.sp('recovery', 'shield_dome', [DOME])
hemisphere(dm, 15.5, (0, 0, 0.9), DOME, scale=(1.0, 1.0, 0.85), u=32, v=16)
ring('recovery', 'state_recovery')
progress_bar(b, 'recovery', 'progress', (0, -10.3, 1.35), 8.0, 0.9, 0.7, 'steel_dark', 'state_recovery', 0.9, 0.0)
csiren(b, 'recovery', 'beacon', (5.6, -5.6, BT + 1.9), 0.8, 'state_recovery')
kr = b.sp('recovery', 'key_ring', ['state_recovery'], origin=(DX, Y0 - 1.8, DZ))
kr.ring(3.6, 3.4, 0.16, (DX, Y0 - 1.0, DZ), 'state_recovery', rot=(pi / 2, 0, 0), seg=40)
tint('recovery', TINT_R)

total = b.finish()
bpy.context.view_layer.update()
print(CODE, 'tris', total, 'objs', len(b.coll.objects))
if PREVIEW:
    cpreview(CODE, 6.0, 42, cy=-0.5, extra=(('detail', -30, 28, 26, 6.5, 'normal'), ('back', 150, 32, 42, 6.0, 'normal'),
                                          ('detail_incident', -30, 28, 26, 6.5, 'incident')))
if EXPORT:
    save_blend(CODE)
    export_glb(CODE)
