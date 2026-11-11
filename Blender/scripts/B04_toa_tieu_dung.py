# B04 - Toa Tieu Dung (18 x 16 x 12 m) - CARTOON / toy diorama (REF_07/08 look).
# Chunky orange shop, pink/white striped awning, huge 3D cart emblem on a roof sign, warm yellow windows, rounded 22x20 plot.
exec(open('/Users/mac/Documents/Cordon/Blender/scripts/common.py').read(), globals())
exec(open('/Users/mac/Documents/Cordon/Blender/scripts/common_B04_B05.py').read(), globals())
PREVIEW = globals().get('PREVIEW', True)
CODE = 'B04'
b = Bld(CODE, 'Tòa Tiêu Dùng', '18x16x12', 14.0)
cartoon_materials()

# ------------------------------------------------------------------ materials (matte, metallic 0)
IDN = CMAT('B04_identity', '#FF8C42', rough=0.7)
IDD = CMAT('B04_identity_dark', '#E8742A', rough=0.75)
TRIM = CMAT('B04_trim', '#FFE3C2', rough=0.7)
AWP = CMAT('B04_awning_pink', '#FF6AA9', rough=0.65)
AWW = CMAT('B04_awning_white', '#FFFFFF', rough=0.7)
GLOW = CMAT('B04_glow', '#FF9A1F', '#FF8A00', 1.0, 0.5)
WGLOW = CMAT('B04_window_glow', '#FFC857', '#FFB43A', 1.0, 0.6)
CART = CMAT('B04_cart_icon', '#FFF6E8', '#FFF1D8', 1.4, 0.5)
ROOFM = CMAT('B04_roof', '#C9703A', rough=0.85)
PLAZA = CMAT('B04_plaza', '#C9C4E6', rough=0.8)
PLAZA2 = CMAT('B04_plaza_tile', '#B4AED8', rough=0.8)
DARK = CMAT('B04_dark', '#3A2A4A', rough=0.7)
PANELBG = CMAT('B04_panel_bg', '#2A1830', rough=0.6)
SHUT = CMAT('B04_shutter', '#4A4260', rough=0.7)
TINT_R = CMAT('B04_tint_incident', '#FF2D3D', '#FF1A2E', 0.7, 0.5, 0.2)
TINT_C = CMAT('B04_tint_recovery', '#5E8FA3', '#58C8D8', 0.5, 0.5, 0.22)
RDIM = CMAT('B04_recovery_dim', '#6C93A8', '#58C8D8', 0.45, 0.7)
WIN_R = CMAT('B04_window_red', '#FF4A55', '#FF2D3D', 1.3, 0.6)
WIN_C = CMAT('B04_window_blue', '#7FA8BC', '#58C8D8', 0.9, 0.6)
GREENP = CMAT('B04_assembly_green', '#3DBB6A', '#22E08A', 0.5, 0.7)
for c, h in zip('abcd', ('#FF6AA9', '#43D6E0', '#FFD84A', '#8E5CF6')):
    CMAT('B04_prod_' + c, h, rough=0.7)
TX_POS = tex_mat('B04_screen_pos', ui_image('B04_ui_pos', 'pos', '#FFA500', 256, 128, 3), 1.5)
TX_OK = tex_mat('B04_screen_ok', ui_image('B04_ui_ok', 'pos', '#22E08A', 256, 128, 4), 1.5)

def P(name, mats=None):
    return b.part(name, mats or [])

# ------------------------------------------------------------------ layout constants
XW, YF, YB = 9.0, -2.0, 8.5            # half width, front wall plane, back wall plane
YC = (YF + YB) / 2
ZF, ZW, ZR = 0.9, 7.4, 8.3             # floor, wall top, roof slab top
SY = -0.8                              # sign centre y
SZ0, SZ1 = ZR, 12.0
SCZ = (SZ0 + SZ1) / 2
SW = 10.6
AWY0, AWZ0, AWY1, AWZ1 = YF - 0.1, 6.5, YF - 2.6, 5.3
N = 12
sw = 17.8 / N
Lw = math.hypot(AWY0 - AWY1, AWZ0 - AWZ1)
ang = math.atan2(AWZ0 - AWZ1, AWY0 - AWY1)
KX, KY = 6.4, -7.2

# ------------------------------------------------------------------ plot (22 x 20), rounded + plaza
pl = P('plot')
rslab(pl, 22, 20, 0.5, 3.4, (0, 0, 0), 'c_curb', 7, 0.18)
rslab(pl, 20.4, 18.4, 0.2, 2.7, (0, 0, 0.5), 'c_sidewalk', 7, 0.08)
rslab(pl, 19.2, 17.2, 0.1, 2.3, (0, 0, 0.7), 'c_lawn', 7, 0.04)
pz = P('plaza')
pz.box((18.6, 5.8, 0.14), (0, -7.0, 0.8), 'B04_plaza', base=True, bev=0.07, seg=2)
for i in range(7):
    pz.box((0.1, 5.4, 0.03), (-7.5 + i * 2.5, -7.0, 0.94), 'B04_plaza_tile')
for j in range(2):
    pz.box((18.0, 0.1, 0.03), (0, -8.5 + j * 2.4, 0.94), 'B04_plaza_tile')

# ------------------------------------------------------------------ body + roof
bd = P('body')
bd.box((18.0, YB - YF, ZW - ZF), (0, YC, ZF), 'B04_identity', base=True, bev=0.4, seg=3)
bd.box((18.5, YB - YF + 0.5, 0.75), (0, YC, ZF), 'B04_trim', base=True, bev=0.25, seg=3)
for sx in (-1, 1):
    for yy in (YF + 0.1, YB - 0.1):
        bd.box((0.9, 0.9, ZW - ZF - 0.1), (sx * 8.85, yy, ZF + 0.05), 'B04_trim', base=True, bev=0.3, seg=3)
rf = P('roof')
rf.box((19.6, YB - YF + 1.6, ZR - ZW), (0, YC, ZW), 'B04_trim', base=True, bev=0.35, seg=3)
rf.box((17.6, YB - YF - 0.4, 0.3), (0, YC, ZR), 'B04_roof', base=True, bev=0.1, seg=2)
rf.box((19.6, 0.55, 0.5), (0, YF - 0.7, ZR), 'B04_trim', base=True, bev=0.2, seg=2)
rf.box((19.6, 0.55, 0.5), (0, YB + 0.7, ZR), 'B04_trim', base=True, bev=0.2, seg=2)
for sx in (-1, 1):
    rf.box((0.55, YB - YF + 1.6, 0.5), (sx * 9.5, YC, ZR), 'B04_trim', base=True, bev=0.2, seg=2)

# ------------------------------------------------------------------ windows / door (chunky, warm glow)
WINS = []   # (u, z, w, h, d, rz, c) - reused by state tint overlays
for sx in (-1, 1):
    WINS.append((sx * 5.4, 3.3, 5.0, 2.7, -YF, 0.0, (0, 0)))
WINS.append((0.0, 2.75, 1.9, 3.4, -YF, 0.0, (0, 0)))
for u in (-2.4, 2.4):
    WINS.append((u, 4.0, 2.4, 2.6, XW, pi / 2, (0, YC)))
    WINS.append((-u, 4.0, 2.4, 2.6, XW, -pi / 2, (0, YC)))
for u in (-3.0, 3.0):
    WINS.append((u, 4.0, 2.4, 2.6, YB - YC, pi, (0, YC)))
win = P('windows', [TRIM, WGLOW])
for (u, z, w, h, d, rz, c) in WINS:
    cols, rows = (3, 2) if w > 4 else (2, 1) if w == 1.9 else (2, 2)
    cwindow(win, u, z, w, h, d, rz, cols, rows, 'B04_trim', 'B04_window_glow', c)
dr = P('door', ['B04_trim', 'steel'])
dr.box((3.8, 0.5, 0.35), (0, YF - 0.45, ZF), 'B04_trim', base=True, bev=0.12, seg=2)
for sx in (-1, 1):
    dr.sphere(0.16, (sx * 0.38, YF - 0.45, 2.75), 'steel', sub=2)
gd = P('display_goods', ['B04_trim', 'B04_prod_a', 'B04_prod_b', 'B04_prod_c', 'B04_prod_d'])
for sx in (-1, 1):
    gd.box((4.6, 0.5, 0.18), (sx * 5.4, YF - 0.28, 2.75), 'B04_trim', bev=0.05, seg=2)
    for k in range(5):
        gd.box((0.5, 0.4, 0.5 + (k % 2) * 0.2), (sx * 5.4 - 1.8 + k * 0.9, YF - 0.28, 2.85), 'B04_prod_' + 'abcd'[(k + (sx > 0)) % 4], base=True, bev=0.1, seg=2)

# ------------------------------------------------------------------ chunky striped awning
aw = P('awning', [AWP, AWW])
for i in range(N):
    m = 'B04_awning_pink' if i % 2 == 0 else 'B04_awning_white'
    cx = -8.9 + sw * (i + 0.5)
    aw.box((sw * 0.995, Lw, 0.42), (cx, (AWY0 + AWY1) / 2, (AWZ0 + AWZ1) / 2), m, rot=(ang, 0, 0), bev=0.12, seg=2)
    aw.box((sw * 0.995, 0.4, 0.8), (cx, AWY1 - 0.02, AWZ1 - 0.35), m, bev=0.1, seg=2)
    aw.prism(half_disc(sw * 0.5, 7), 0.4, (cx, AWY1 - 0.02, AWZ1 - 0.75), m)
aw.box((18.0, 0.5, 0.4), (0, AWY0 + 0.05, AWZ0 + 0.1), 'B04_trim', bev=0.15, seg=2)
sl = P('string_lights', ['B04_glow'])
for i in range(18):
    sl.sphere(0.12, (-8.2 + i * 0.97, AWY1 - 0.3, AWZ1 - 1.0 - 0.07 * sin(i * 0.9)), 'B04_glow', sub=1)

# ------------------------------------------------------------------ BIG roof sign with 3D cart emblem
sg = P('sign_frame', [TRIM])
sg.box((SW, 1.3, SZ1 - SZ0), (0, SY, SZ0), 'B04_trim', base=True, bev=0.45, seg=3)
for sx in (-1, 1):
    sg.cyl(0.42, 0.6, (sx * (SW / 2 - 0.5), SY - 0.1, SZ1), 'B04_trim', verts=12, r2=0.2, smooth=True)
sf = P('sign_face', [GLOW, CART])
sf.box((SW - 1.1, 0.3, SZ1 - SZ0 - 1.0), (0, SY - 0.72, SCZ), 'B04_glow', bev=0.3, seg=3)
cart3d(sf, (0, SY - 1.05, SCZ + 0.1), 3.9, 'B04_cart_icon', 'B04_glow', 0.5)

# ------------------------------------------------------------------ props
lp = P('lamps')
for p in ((-10.2, -5.0), (10.2, -5.0), (-10.2, 7.0), (10.2, 7.0)):
    clamp_post(lp, (p[0], p[1], 0.5), 3.4)
bn = P('benches')
cbench(bn, (-6.8, -9.1, 0.9), pi); cbench(bn, (6.8, -9.1, 0.9), pi)
pm = P('planters', ['B04_trim']); pml = P('planters_leaf', ['c_bush', 'flower_pink', 'flower_yellow'])
for sx in (-1, 1):
    pm.box((1.7, 1.0, 0.9), (sx * 3.6, YF - 1.0, ZF), 'B04_trim', base=True, bev=0.25, seg=3)
    pml.sphere(0.7, (sx * 3.6, YF - 1.0, ZF + 1.3), 'c_bush', sub=2)
    pml.sphere(0.2, (sx * 3.9, YF - 1.25, ZF + 1.9), 'flower_pink', sub=1)
    pml.sphere(0.2, (sx * 3.3, YF - 1.25, ZF + 1.8), 'flower_yellow', sub=1)
tr_t = P('trees_trunk', ['c_trunk']); tr_l = P('trees_leaf', ['c_leaf_a', 'c_leaf_b', 'c_leaf_c', 'c_leaf_pink', 'flower_pink'])
for (x, y, k, s) in ((-9.6, -8.8, 0, 0.8), (9.6, -8.8, 2, 0.8), (-10.2, 1.4, 0, 0.75), (10.2, 1.4, 0, 0.75), (-8.6, 9.3, 2, 0.8), (8.8, 9.3, 0, 0.8)):
    rtree(tr_t, tr_l, (x, y, 0.8), s, k)
pe = P('people', ['c_pants', 'c_skin', 'c_hair', 'c_shirt_a', 'c_shirt_b', 'c_shirt_c', 'c_shirt_d', 'c_vest'])
cperson(pe, (-2.6, -7.0, 0.94), 0.3, 'c_shirt_b', 1.15); cperson(pe, (3.2, -8.2, 0.94), 3.0, 'c_shirt_a', 1.15); cperson(pe, (0.4, -9.0, 0.94), 3.6, 'c_shirt_c', 1.1)
kt = P('pos_kiosk', ['B04_dark', 'B04_trim', TX_POS])
kt.box((1.5, 1.1, 1.1), (KX, KY, 0.94), 'B04_dark', base=True, bev=0.25, seg=3)
kt.box((1.9, 0.5, 1.3), (KX, KY - 0.2, 2.0), 'B04_dark', base=True, bev=0.2, seg=3)
screen_quad(kt, (KX, KY - 0.47, 2.65), 1.5, 0.95, TX_POS)
kt.box((1.0, 0.45, 0.2), (KX, KY - 0.4, 1.75), 'B04_trim', bev=0.06, seg=2)
gl = P('glow_trim', ['B04_glow'])
gl.box((19.2, 0.14, 0.14), (0, YF - 1.05, ZR + 0.52), 'B04_glow')
for sx in (-1, 1):
    gl.box((0.14, YB - YF + 1.4, 0.14), (sx * 9.85, YC, ZR + 0.52), 'B04_glow')
gl.box((SW + 0.3, 0.12, 0.12), (0, SY - 0.68, SZ0 + 0.05), 'B04_glow')

# ------------------------------------------------------------------ state helpers
def plot_ring(state, mat):
    r = b.sp(state, 'plot_ring', [mat], origin=(0, 0, 0.5))
    rslab(r, 21.5, 19.5, 0.1, 3.2, (0, 0, 0.5), mat, 7, 0.0)

def pane_overlay(mb, mat, th=0.05):
    for (u, z, w, h, d, rz, c) in WINS:
        mb.push((c[0], c[1], 0), (0, 0, rz))
        mb.box((w, th, h), (u, -(d + 0.14), z), mat)
        mb.pop()

def awning_overlay(mb, mat):
    for i in range(0, N, 2):
        cx = -8.9 + sw * (i + 0.5)
        mb.box((sw * 0.99, Lw + 0.02, 0.1), (cx, (AWY0 + AWY1) / 2, (AWZ0 + AWZ1) / 2 + 0.06), mat, rot=(ang, 0, 0), bev=0.03, seg=1)
        mb.box((sw * 0.99, 0.08, 0.8), (cx, AWY1 - 0.1, AWZ1 - 0.35), mat)
        mb.prism(half_disc(sw * 0.5, 7), 0.08, (cx, AWY1 - 0.1, AWZ1 - 0.75), mat)

def sign_overlay(state, mat, icon_fn):
    s_ = b.sp(state, 'sign_overlay', [mat, 'B04_cart_icon', 'hazard_black'], origin=(0, SY - 1.0, SCZ))
    s_.box((SW - 1.1, 0.3, SZ1 - SZ0 - 1.0), (0, SY - 1.0, SCZ), mat, bev=0.3, seg=3)
    icon_fn(s_)

def siren(state, name, pos, r, mat):
    x, y, z = pos
    o = b.sp(state, name, [mat, 'steel_dark'], origin=(x, y, z + r * 0.8))
    o.cyl(r * 1.3, r * 0.7, (x, y, z), 'steel_dark', verts=14, bev=0.06, smooth=True)
    o.uvsphere(r, (x, y, z + r * 0.7), mat, scale=(1, 1, 1.15), u=14, v=9)

# ---- normal : checkout ready (green check), status beacon, warm plot ring
n = b.sp('normal', 'pos_ready', ['B04_dark', TX_OK, 'state_ok'])
screen_quad(n, (KX, KY - 0.5, 2.65), 1.4, 0.88, TX_OK)
icon_check(n, (KX, KY - 0.58, 2.65), 0.9, 'state_ok', 0.1)
siren('normal', 'status_beacon', (-7.0, 5.0, ZR + 0.3), 0.55, 'state_ok')
plot_ring('normal', 'B04_glow')
nb = b.sp('normal', 'ready_badge', ['state_ok', 'B04_dark', 'steel_dark'], origin=(KX, KY - 0.7, 4.3))
nb.box((1.6, 0.25, 1.1), (KX, KY - 0.7, 4.4), 'B04_dark', bev=0.2, seg=3)
icon_check(nb, (KX, KY - 0.92, 4.4), 0.95, 'state_ok', 0.14)
nb.box((0.14, 0.14, 0.9), (KX, KY - 0.7, 3.4), 'steel_dark')

# ---- warning : amber beacons, floating "check this transaction" popup (warning + duplicate receipts), amber frame
wp = b.sp('warning', 'popup_panel', ['B04_panel_bg', 'state_warning', 'hazard_black', 'B04_cart_icon', 'steel_dark'], origin=(KX - 0.6, KY - 1.0, 4.6))
wp.box((3.8, 0.3, 2.6), (KX - 0.6, KY - 1.0, 4.8), 'B04_panel_bg', bev=0.35, seg=3)
box_frame(wp, (KX - 0.6, 4.8), 3.8, 2.6, 0.2, 'state_warning', y=KY - 1.2, d=0.22, bev=0.08)
icon_warn(wp, (KX - 1.5, KY - 1.25, 4.95), 1.5, 'state_warning')
for k in range(2):
    wp.box((0.75, 0.1, 1.0), (KX + k * 0.85, KY - 1.25, 4.8 - k * 0.12), 'B04_cart_icon', bev=0.04, seg=2)
    for r in range(3):
        wp.box((0.5, 0.06, 0.08), (KX + k * 0.85, KY - 1.32, 5.05 - k * 0.12 - r * 0.25), 'steel_dark')
wst = b.sp('warning', 'popup_stem', ['state_warning'])
wst.box((0.16, 0.16, 2.0), (KX - 0.6, KY - 1.0, 2.6), 'state_warning')
siren('warning', 'beacon_L', (-7.5, 5.0, ZR + 0.3), 0.7, 'state_warning')
siren('warning', 'beacon_R', (7.5, 5.0, ZR + 0.3), 0.7, 'state_warning')
wsr = b.sp('warning', 'sign_frame_ring', ['state_warning'], origin=(0, SY - 1.0, SCZ))
box_frame(wsr, (0, SCZ), SW + 0.9, SZ1 - SZ0 + 0.9, 0.3, 'state_warning', y=SY - 0.75, d=0.2, bev=0.1)
plot_ring('warning', 'state_warning')
wlt = b.sp('warning', 'amber_trim', ['state_warning'])
wlt.box((19.2, 0.18, 0.18), (0, YF - 1.05, ZR + 0.56), 'state_warning')
for sx in (-1, 1):
    wlt.box((0.18, YB - YF + 1.4, 0.18), (sx * 9.85, YC, ZR + 0.56), 'state_warning')
wlt.box((18.2, 0.2, 0.2), (0, AWY1 - 0.1, AWZ1 + 0.1), 'state_warning')

# ---- incident (REF_07 evacuation): red tint, red "!" sign, red awning, shutter + lock, siren, caution tape, evacuees
tint_shell(b, 'incident', 'tint_glow', (18.5, YB - YF + 0.5, ZW - ZF + 0.2), (0, YC, (ZF + ZW) / 2), 'B04_tint_incident')
iw = b.sp('incident', 'window_glow', ['B04_window_red'])
pane_overlay(iw, 'B04_window_red')
ia = b.sp('incident', 'awning_overlay', ['state_incident'], origin=(0, AWY1, AWZ1))
awning_overlay(ia, 'state_incident')
sign_overlay('incident', 'state_incident', lambda s_: icon_warn(s_, (0, SY - 1.4, SCZ + 0.05), 4.0, 'B04_cart_icon', 'state_incident', 0.4))
ish = b.sp('incident', 'shutter_barrier', ['B04_shutter', 'state_incident'], origin=(0, YF - 0.9, 4.6))
for i in range(12):
    ish.box((2.2, 0.16, 0.26), (0, YF - 0.8, 4.4 - i * 0.28), 'B04_shutter', bev=0.05, seg=2)
ish.box((2.5, 0.25, 0.35), (0, YF - 0.8, 4.65), 'B04_shutter', bev=0.1, seg=2)
ilk = b.sp('incident', 'lock_shield', ['state_incident', 'hazard_black', 'B04_cart_icon'], origin=(0, YF - 1.7, 3.0))
icon_shield2(ilk, (0, YF - 1.7, 3.0), 2.4, 'state_incident', 'hazard_black', 0.35)
icon_lock(ilk, (0, YF - 2.05, 3.0), 1.3, 'B04_cart_icon', 'state_incident', 0.2)
siren('incident', 'siren_beacon', (0, 5.0, ZR + 0.3), 1.0, 'state_incident')
siren('incident', 'siren_beacon_L', (-8.2, 6.5, ZR + 0.3), 0.6, 'state_incident')
siren('incident', 'siren_beacon_R', (8.2, 6.5, ZR + 0.3), 0.6, 'state_incident')
for x in (-10.3, 10.3):
    siren('incident', 'lamp_beacon_' + ('L' if x < 0 else 'R'), (x, -9.4, 0.7), 0.5, 'state_incident')
tb = b.sp('incident', 'barrier_tape', ['hazard_yellow', 'hazard_black', 'state_incident', 'c_pole_post'])
PTS = [(-10.3, -9.4), (-5.2, -9.4), (0.0, -9.4), (5.2, -9.4), (10.3, -9.4)]
for (x, y) in PTS: tape_post(tb, x, y)
for a_, b_ in zip(PTS[:-1], PTS[1:]): tape_line(tb, a_, b_)
for S in ([(-10.3, -9.4), (-10.3, -4.2), (-10.3, 0.6)], [(10.3, -9.4), (10.3, -4.2), (10.3, 0.6)]):
    for (x, y) in S[1:]: tape_post(tb, x, y)
    for a_, b_ in zip(S[:-1], S[1:]): tape_line(tb, a_, b_)
plot_ring('incident', 'state_incident')
ev = b.sp('incident', 'assembly_zone', [GREENP, 'c_vest', 'c_pants', 'c_skin', 'c_hair', 'c_shirt_a', 'c_shirt_b', 'c_shirt_c', 'c_shirt_d', 'state_ok', 'c_pole_post', 'c_curb'])
rslab(ev, 6.6, 4.6, 0.12, 1.2, (-6.4, -6.7, 0.9), 'B04_assembly_green', 5, 0.04)
for k in range(3):
    prism_b(ev, [(-.4, .3), (.4, 0.0), (-.4, -.3)], 0.12, (-2.4 + k * 1.1, -7.6, 1.08), 'state_ok', rot=(pi / 2, 0, 0), scale=0.9, bev=0.02)
for (x, y, rz, sh, vst) in ((-7.6, -6.2, 2.2, 'c_shirt_a', False), (-6.2, -7.4, 1.4, 'c_shirt_b', False), (-5.2, -5.9, 3.0, 'c_shirt_c', True), (-7.0, -7.9, 2.6, 'c_shirt_d', False)):
    cperson(ev, (x, y, 1.02), rz, sh, 1.15, vest=vst)
ev.box((0.14, 0.14, 2.4), (-9.0, -4.7, 1.0), 'c_pole_post')
ev.box((2.2, 0.2, 1.1), (-9.0, -4.8, 3.0), 'B04_assembly_green', bev=0.2, seg=2)
icon_check(ev, (-9.0, -5.0, 3.0), 0.8, 'c_curb', 0.1)

# ---- recovery : refund check / reconciliation -> blue-grey, floating progress, shield+check, checklist
tint_shell(b, 'recovery', 'tint_glow', (18.5, YB - YF + 0.5, ZW - ZF + 0.2), (0, YC, (ZF + ZW) / 2), 'B04_tint_recovery')
rw = b.sp('recovery', 'window_glow', ['B04_window_blue'])
pane_overlay(rw, 'B04_window_blue')
ra = b.sp('recovery', 'awning_overlay', ['B04_recovery_dim'], origin=(0, AWY1, AWZ1))
awning_overlay(ra, 'B04_recovery_dim')
sign_overlay('recovery', 'B04_recovery_dim', lambda s_: icon_refresh(s_, (0, SY - 1.4, SCZ + 0.05), 3.4, 'B04_cart_icon', 0.4))
rsh = b.sp('recovery', 'shield', ['state_recovery', 'steel_dark', 'B04_cart_icon'], origin=(0, YF - 2.4, 3.2))
icon_shield2(rsh, (0, YF - 2.5, 3.2), 2.6, 'state_recovery', 'steel_dark', 0.35)
icon_check(rsh, (0, YF - 2.9, 3.2), 1.3, 'B04_cart_icon', 0.2)
rpn = b.sp('recovery', 'progress_panel', ['B04_panel_bg', 'state_recovery', 'steel_dark'])
rpn.box((5.4, 0.35, 1.7), (-5.2, -6.2, 5.4), 'B04_panel_bg', bev=0.4, seg=3)
box_frame(rpn, (-5.2, 5.4), 5.4, 1.7, 0.18, 'state_recovery', y=-6.42, d=0.22, bev=0.07)
icon_refresh(rpn, (-7.5, -6.5, 5.4), 1.1, 'state_recovery', 0.18)
for sx in (-1, 1):
    rpn.box((0.14, 0.14, 3.6), (-5.2 + sx * 2.3, -6.2, 0.95), 'steel_dark')
progress_bar(b, 'recovery', 'progress', (-4.6, -6.55, 5.4), 3.4, 0.55, 0.75, 'steel_dark', 'state_recovery', 0.24)
rck = b.sp('recovery', 'checklist_panel', ['B04_panel_bg', 'state_recovery', 'steel_dark', 'B04_cart_icon'])
rck.box((3.6, 0.3, 3.2), (5.8, -6.6, 2.9), 'B04_panel_bg', bev=0.35, seg=3)
box_frame(rck, (5.8, 2.9), 3.6, 3.2, 0.16, 'state_recovery', y=-6.78, d=0.2, bev=0.06)
for i in range(3):
    z = 3.8 - i * 0.95
    rck.box((0.55, 0.12, 0.55), (4.7, -6.85, z), 'state_recovery' if i < 2 else 'steel_dark', bev=0.1, seg=2)
    if i < 2: icon_check(rck, (4.7, -6.95, z), 0.75, 'B04_cart_icon', 0.1)
    rck.box((1.6 - i * 0.3, 0.1, 0.22), (6.1, -6.85, z), 'state_recovery' if i < 2 else 'steel_dark', bev=0.05, seg=2)
rck.box((0.14, 0.14, 1.9), (4.4, -6.6, 0.95), 'steel_dark'); rck.box((0.14, 0.14, 1.9), (7.2, -6.6, 0.95), 'steel_dark')
plot_ring('recovery', 'state_recovery')
rtr = b.sp('recovery', 'teal_trim', ['state_recovery'])
rtr.box((19.2, 0.18, 0.18), (0, YF - 1.05, ZR + 0.56), 'state_recovery')
for sx in (-1, 1):
    rtr.box((0.18, YB - YF + 1.4, 0.18), (sx * 9.85, YC, ZR + 0.56), 'state_recovery')

# ------------------------------------------------------------------ finish
total = b.finish()
bpy.context.view_layer.update()
print(CODE, 'tris', total, 'objs', len(b.coll.objects))

if PREVIEW:
    kw = dict(center=(0, 0, 4.5), scale=34, size=(1200, 900), az=-35, elev=32)
    kw.update(globals().get('CAM', {}))
    cartoon_preview(CODE, states=globals().get('PREVIEW_STATES', ('normal', 'warning', 'incident', 'recovery')), **kw)
if globals().get('EXPORT', True):
    reset_state_visibility(CODE); all_visible(); cleanup_scene()
    bpy.ops.wm.save_as_mainfile(filepath=f'{PROJ}/out/{CODE}.blend')
    export_glb(CODE, '/Users/mac/Documents/Cordon/Frontend/public/models/city/B04.glb')
if globals().get('TOPN'):
    L = sorted(((tris(o), o.name) for o in b.coll.all_objects), reverse=True)
    for t, nme in L[:TOPN]: print('TOP', t, nme)
    print('STATE tris', {s: sum(tris(o) for o in b.st[s].children_recursive) for s in STATES})
