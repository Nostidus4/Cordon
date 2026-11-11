# B01 - Hoi dong duyet (24 x 18 x 18 m). CARTOON/TOY style: chunky violet council hall, 4 fat columns, big pediment with a
# golden scales emblem, two banners, rounded plot with lawn, round trees, lamps, benches, little people.
exec(open('/Users/mac/Documents/Cordon/Blender/scripts/common.py').read(), globals())
PREVIEW = globals().get('PREVIEW', True)
CODE = 'B01'
b = Bld(CODE, 'Hội đồng duyệt', '24x18x18', 21.0)
cartoon_materials()

IDN, GL, DKN, STN, STMN, GDN, GGN, DRN, WIN = 'B01_identity', 'B01_glow', 'B01_violet_dark', 'B01_stone', 'B01_stone_mid', 'B01_gold', 'B01_gold_glow', 'B01_door', 'B01_window'
MAT(IDN, '#8E5CF6', 0.7, 0.0)
MAT(GL, '#C58BFF', 0.4, 0.0, '#B56CFF', 1.6)
MAT(DKN, '#6A3BD8', 0.7)
MAT(STN, '#EFEAFF', 0.65)
MAT(STMN, '#BDA9F5', 0.7)
MAT(GDN, '#FFC93D', 0.5, 0.0, '#FFB400', 0.7)
MAT(GGN, '#FFD25A', 0.4, 0.0, '#FFC73D', 1.6)
MAT(DRN, '#3B2380', 0.6)
MAT(WIN, '#FFD27A', 0.4, 0.0, '#FFA94D', 3.2)
MAT('B01_roof_tile', '#A785FA', 0.7)
MAT('B01_banner', '#5B2FD0', 0.7)
ZS = 0.9                                     # sidewalk level of the plot
Z1 = ZS + 0.9                                # tier-1 top
Z0 = Z1 + 0.9                                # tier-2 top = hall floor

# ------------------------------------------------------------------ plot (rounded curb + sidewalk + lawn)
plot = b.part('plot', ['c_curb', 'c_sidewalk', 'c_lawn'])
cplot(plot, 0, 0.5, 38, 30, 0, 0.8, 'c_lawn', 1.5)

# ------------------------------------------------------------------ podium + stairs
base = b.part('base', [STMN, STN])
cbox(base, (26.0, 16.4, 0.9), (0, 1.8, ZS), STMN, base=True)                    # tier 1
cbox(base, (23.6, 14.4, 0.9), (0, 1.8, Z1), STN, base=True)                     # tier 2
for i in range(5):                                                               # stairs (chunky)
    top = Z0 - 0.36 * i
    cbox(base, (11.0, 0.95, top - ZS), (0, -5.6 - 0.95 * (i + 0.5), ZS), STN, base=True, bev=0.12, seg=2)
for sx in (-1, 1):
    cbox(base, (1.6, 5.4, 2.0), (sx * 6.5, -8.0, ZS), STMN, base=True, bev=0.3)

# ------------------------------------------------------------------ hall body + trim
body = b.part('body', [IDN, STN, DKN, STMN])
YC, HW, HD = 2.8, 10.0, 5.6                    # hall centre y, half width, half depth (y from -2.8 to 8.4)
HH = 10.2
cbox(body, (HW * 2, HD * 2, HH), (0, YC, Z0), IDN, base=True, bev=0.4)
cbox(body, (HW * 2 + 0.8, HD * 2 + 0.8, 0.8), (0, YC, Z0), STMN, base=True, bev=0.25)
cbox(body, (HW * 2 + 0.5, HD * 2 + 0.5, 0.5), (0, YC, Z0 + 5.0), STN, base=True, bev=0.2)     # mid band
for sx in (-1, 1):
    for sy in (-1, 1):
        cbox(body, (1.3, 1.3, HH), (sx * (HW - 0.1), YC + sy * (HD - 0.1), Z0), STN, base=True, bev=0.3)
ZT = Z0 + HH
cbox(body, (HW * 2 + 2.0, HD * 2 + 2.0, 1.2), (0, YC, ZT), STN, base=True, bev=0.35)         # entablature
cbox(body, (HW * 2 + 3.0, HD * 2 + 3.0, 0.5), (0, YC, ZT + 1.2), STMN, base=True, bev=0.2)   # cornice
cbox(body, (23.4, 4.6, 1.2), (0, -5.2, ZT), STN, base=True, bev=0.35)                        # portico entablature
cbox(body, (24.4, 5.2, 0.5), (0, -5.2, ZT + 1.2), STMN, base=True, bev=0.2)
cbox(body, (21.0, 0.5, 0.9), (0, -7.55, ZT + 0.15), DKN, base=True, bev=0.1)                  # violet frieze

# ------------------------------------------------------------------ fat columns
col = b.part('columns', [STN, STMN])
for x in (-9.0, -3.3, 3.3, 9.0):
    column(col, (x, -5.2, Z0), 1.05, HH, STN, STMN, verts=14)

# ------------------------------------------------------------------ pediment + roof (clean, no greebles)
ZP = ZT + 1.7
ped = b.part('pediment', [STN, DKN, IDN, GDN, GGN])
ped.prism([(-12.2, 0), (12.2, 0), (0, 4.9)], 4.6, (0, -5.2, ZP), STN)
ped.prism([(-10.6, 0.5), (10.6, 0.5), (0, 4.0)], 0.4, (0, -7.6, ZP), DKN)                  # tympanum (violet dark)
ped.prism([(-9.4, 0.4), (9.4, 0.4), (0, 3.3)], 0.3, (0, -7.8, ZP), IDN)
icon_scales(ped, (0, -8.1, ZP + 1.8), 4.2, GDN, 0.6)                                       # BIG golden scales
ped.sphere(0.6, (0, -5.2, ZP + 5.2), GDN, sub=2)
for sx in (-1, 1):
    ped.sphere(0.55, (sx * 12.0, -5.2, ZP + 0.3), GDN, sub=2)
roof = b.part('roof', ['B01_roof_tile', STMN, STN, WIN])
roof.prism([(-11.8, 0), (11.8, 0), (0, 4.9)], 12.6, (0, YC + 0.5, ZP), 'B01_roof_tile')
cbox(roof, (0.9, 12.8, 0.7), (0, YC + 0.5, ZP + 4.7), STMN, bev=0.25, seg=2)
for k_ in (-1, 1):                                                                           # two chunky chimneys
    cbox(roof, (1.6, 1.6, 2.4), (k_ * 5.0, YC + 3.0, ZP + 3.4), STN, base=True, bev=0.25)

# ------------------------------------------------------------------ door / windows (chunky)
dr = b.part('door', [DRN, GDN, WIN, STN])
FY = YC - HD                                    # front wall y
cbox(dr, (5.2, 0.7, 7.4), (0, FY - 0.15, Z0), STN, base=True, bev=0.25)
cbox(dr, (4.0, 0.4, 6.4), (0, FY - 0.55, Z0), DRN, base=True, bev=0.15)
cbox(dr, (3.4, 0.2, 5.6), (0, FY - 0.8, Z0 + 0.3), WIN, base=True, bev=0.08, seg=2)
dr.box((0.2, 0.26, 5.6), (0, FY - 0.94, Z0 + 0.3), GDN, base=True)
dr.box((3.4, 0.26, 0.2), (0, FY - 0.94, Z0 + 3.4), GDN)
cbox(dr, (5.6, 0.9, 0.5), (0, FY - 0.3, Z0 + 7.2), GDN, bev=0.15, seg=2)

win = b.part('windows', [STN, WIN])
for sx in (-1, 1):
    window(win, sx * 6.2, Z0 + 5.4, 2.4, 5.2, HD, 0.0, 1, 2, STN, WIN, c=(0, YC))
for u in (-3.4, 0.0, 3.4):
    for rz in (pi / 2, -pi / 2):
        window(win, u if rz > 0 else -u, Z0 + 5.4, 2.2, 5.0, HW, rz, 1, 2, STN, WIN, c=(0, YC))
for u in (-6.0, -2.0, 2.0, 6.0):
    window(win, u, Z0 + 5.4, 2.2, 5.0, HD, pi, 1, 2, STN, WIN, c=(0, YC))

# ------------------------------------------------------------------ banners (big, with gold emblem)
ban = b.part('banners', ['B01_banner', GDN, STN])
for sx in (-1, 1):
    x = sx * 11.6
    cbox(ban, (2.6, 0.5, 0.45), (x, -7.8, ZT + 0.2), GDN, bev=0.12, seg=2)                    # rod
    ban.prism([(-1.2, 0), (1.2, 0), (1.2, -7.2), (0, -6.0), (-1.2, -7.2)], 0.3, (x, -7.9, ZT), 'B01_banner')
    ban.prism([(-1.0, 0), (-0.85, 0), (-0.85, -6.8), (-1.0, -7.0)], 0.34, (x, -7.92, ZT - 0.1), GDN)
    ban.prism([(1.0, 0), (0.85, 0), (0.85, -6.8), (1.0, -7.0)], 0.34, (x, -7.92, ZT - 0.1), GDN)
    ban.cyl(0.8, 0.3, (x, -8.15, ZT - 3.0), GDN, rot=(pi / 2, 0, 0), verts=16, base=False)
    ban.cyl(0.5, 0.34, (x, -8.2, ZT - 3.0), 'B01_banner', rot=(pi / 2, 0, 0), verts=16, base=False)
    ban.sphere(0.28, (x, -8.3, ZT - 3.0), GDN, sub=2)

# ------------------------------------------------------------------ neon accents (only a few)
gl = b.part('glow', [GL, GGN])
gl.box((24.0, 0.2, 0.2), (0, -7.5, ZT - 0.05), GL)
for sx in (-1, 1):
    gl.box((0.2, 16.4, 0.2), (sx * 13.1, 1.8, Z1 - 0.1), GL)
for x in (-9.0, -3.3, 3.3, 9.0):
    gl.box((0.9, 0.9, 0.16), (x, -6.5, Z0 + 0.05), GGN)

# ------------------------------------------------------------------ plot props
pr = b.part('props', ['c_pole_post', 'c_lamp_glow', 'c_bench', 'c_pants', 'c_skin', 'c_hair', 'c_shirt_a', 'c_shirt_b', 'c_shirt_c', 'c_shirt_d', 'c_vest', 'c_bush', 'flower_pink', 'flower_yellow'])
tt = b.part('trees_trunk', ['c_trunk']); tl = b.part('trees_leaf', ['c_leaf_a', 'c_leaf_b', 'c_leaf_c', 'c_leaf_pink', 'flower_pink'])
for x in (-7.8, 7.8):
    clamp_post(pr, (x, -9.6, ZS))
for (x, y) in ((-17.0, -12.0), (17.0, -12.0), (-17.0, 14.0), (17.0, 14.0)):
    clamp_post(pr, (x, y, ZS))
cbench(pr, (-13.5, -9.6, ZS + 0.25), 0); cbench(pr, (13.5, -9.6, ZS + 0.25), 0)
for (x, y, c) in ((-3.5, -11.8, 'c_shirt_b'), (3.8, -12.2, 'c_shirt_a'), (0.5, -10.8, 'c_shirt_c'), (15.0, -4.0, 'c_shirt_d'), (-15.0, -6.5, 'c_shirt_b')):
    cperson(pr, (x, y, ZS + 0.25), pi + 0.3, c)
cperson(pr, (-12.5, -5.0, ZS + 0.25), -0.8, 'c_shirt_a', vest=True)
for sx in (-1, 1):                              # bushes + flowers beside the podium
    for k in range(4):
        pr.sphere(0.95, (sx * 13.0, -5.8 + k * 2.6, ZS + 0.6), 'c_bush', sub=2, scale=(1, 1, 0.8))
        pr.sphere(0.2, (sx * 12.5, -5.0 + k * 2.6, ZS + 1.4), 'flower_pink' if k % 2 else 'flower_yellow', sub=1)
for (x, y, k, s) in ((-16.0, 6.0, 0, 1.3), (16.0, 6.0, 2, 1.3), (-16.0, -3.0, 2, 1.2), (16.0, -2.5, 0, 1.2), (-16.0, 13.0, 0, 1.1), (16.0, 13.0, 2, 1.1), (-9.0, 13.0, 0, 1.3), (9.0, 13.0, 0, 1.3), (-16.5, -10.0, 0, 1.0), (16.5, -10.0, 2, 1.0)):
    rtree(tt, tl, (x, y, ZS + 0.3), s, k)

# ------------------------------------------------------------------ STATES
SIGN = MAT('B01_sign_panel', '#2B1A6B', 0.5)
MAT('B01_progress_violet', '#8E5CF6', 0.4, 0.0, '#B56CFF', 3.0)
BX, BY, BZ = -9.0, -11.2, ZS

def board(state, name, mat_frame, pos_x=BX, rz=0.18):
    s_ = b.sp(state, name, [SIGN, 'screen_dark', mat_frame, 'steel_dark', GL, GGN, 'hazard_black'])
    s_.push((pos_x, BY, BZ), (0, 0, rz))
    for dx in (-2.5, 2.5):
        cbox(s_, (0.4, 0.4, 2.6), (dx, 0, 0), 'steel_dark', base=True, bev=0.1, seg=2)
    s_.box((6.2, 0.4, 3.0), (0, 0, 3.7), mat_frame, bev=0.2, seg=2)
    s_.box((5.6, 0.2, 2.5), (0, -0.2, 3.7), 'screen_dark')
    return s_

# --- normal : quorum reached, gold scales glow, calm violet light
n = board('normal', 'quorum_panel', GGN)
n.text('QUORUM  ĐẠT', 0.5, (0, -0.4, 4.4), GGN, depth=0.08)
n.text('16 / 24   66%', 0.52, (0, -0.4, 3.6), GL, depth=0.08)
n.pop()
progress_bar(b, 'normal', 'quorum_progress', (BX, BY - 0.25, ZS + 2.75), 5.0, 0.4, 0.66, 'steel_dark', 'B01_progress_violet', 0.2, 0.18)
glow_ring(b, 'normal', 'scales_halo', (0, -8.0, ZP + 1.8), 3.8, 3.4, GGN, 0.2, rot=(pi / 2, 0, 0))
lt = b.sp('normal', 'violet_uplights', [GL])
for x in (-6.0, 6.0, -9.0, 9.0):
    lt.box((0.8, 0.8, 0.5), (x, -7.0, Z0 + 0.1), GL, bev=0.15)

# --- warning : PENDING, one amber column, hourglass
w = board('warning', 'pending_panel', 'state_warning')
w.text('PENDING', 0.8, (0, -0.4, 4.35), 'state_warning', depth=0.08)
w.text('CHỜ QUORUM  12 / 24', 0.38, (0, -0.4, 3.35), 'state_warning', depth=0.07)
icon_hourglass(w, (-2.2, -0.4, 4.35), 1.0, 'state_warning')
w.pop()
progress_bar(b, 'warning', 'quorum_progress', (BX, BY - 0.25, ZS + 2.75), 5.0, 0.4, 0.5, 'steel_dark', 'state_warning', 0.2, 0.18)
cf = b.sp('warning', 'column_flash', ['state_warning'], origin=(-3.3, -5.2, Z0 + 5.0))
for dz in (1.0, 5.1, 9.2):
    cf.cyl(1.25, 0.45, (-3.3, -5.2, Z0 + dz), 'state_warning', verts=14, bev=0.05)
halo = b.sp('warning', 'scales_halo', ['state_warning'], origin=(0, -8.0, ZP + 1.75))
halo.ring(3.8, 3.4, 0.2, (0, -8.0, ZP + 1.8), 'state_warning', rot=(pi / 2, 0, 0))
icw = b.sp('warning', 'warn_icon', ['state_warning', 'hazard_black'], origin=(5.4, -8.1, ZP + 1.6))
icon_warn(icw, (5.4, -8.1, ZP + 1.6), 2.0, 'state_warning')
bw = b.sp('warning', 'amber_uplights', ['state_warning'])
for x in (-6.0, 6.0):
    bw.box((0.8, 0.8, 0.5), (x, -7.0, Z0 + 0.1), 'state_warning', bev=0.15)

# --- incident : unauthorised vote -> red alarm, vote lock, barrier, VI PHAM POLICY
ic = b.sp('incident', 'alarm_triangle', ['state_incident', 'hazard_black'], origin=(0, -8.1, ZP + 1.75))
icon_warn(ic, (0, -8.1, ZP + 1.7), 4.4, 'state_incident')
lk = b.sp('incident', 'vote_lock', ['state_incident', 'hazard_black'], origin=(0, FY - 1.1, Z0 + 4.5))
icon_lock(lk, (0, FY - 1.1, Z0 + 4.5), 2.6, 'state_incident')
br = b.sp('incident', 'barrier', ['hazard_yellow', 'hazard_black', 'steel_dark'])
for x in (-5.8, 5.8):
    cbox(br, (0.4, 0.4, 1.8), (x, -10.4, ZS), 'steel_dark', base=True, bev=0.1, seg=2)
hazard_bar(br, (-5.8, -10.4), (5.8, -10.4), ZS + 1.4, 0.6, 0.28, 9)
hazard_bar(br, (-5.8, -10.4), (5.8, -10.4), ZS + 0.6, 0.45, 0.28, 9)
sg = board('incident', 'sign_violation', 'state_incident')
sg.text('VI PHẠM POLICY', 0.62, (0, -0.4, 4.4), 'state_incident', depth=0.08)
sg.text('ĐÃ KHÓA TẠM QUYỀN BIỂU QUYẾT', 0.27, (0, -0.4, 3.6), 'state_incident', depth=0.06)
sg.pop()
sbar = b.sp('incident', 'sign_stripes', ['hazard_yellow', 'hazard_black', 'state_incident'])
sbar.push((BX, BY, BZ), (0, 0, 0.18))
for k in range(10):
    sbar.box((0.62, 0.25, 0.4), (-2.8 + k * 0.62, -0.05, 2.3), 'state_incident' if k % 2 == 0 else 'hazard_black')
sbar.pop()
for x in (-12.5, 12.5):
    beacon(b, 'incident', 'siren_' + ('L' if x < 0 else 'R'), (x, -9.0, ZS), 0.7, 'state_incident')
ri = b.sp('incident', 'red_uplights', ['state_incident'])
for x in (-6.0, 6.0, -12.5, 12.5):
    ri.box((0.8, 0.8, 0.5), (x, -7.0, Z0 + 0.1), 'state_incident', bev=0.15)

# --- recovery : safe mode -> blue-grey shield, 72% progress, checklist
sh = b.sp('recovery', 'shield', ['state_recovery', 'white', 'steel_dark'], origin=(0, -8.1, ZP + 1.75))
icon_shield(sh, (0, -8.1, ZP + 1.7), 4.6, 'state_recovery', 'steel_dark', 0.3)
icon_check(sh, (0, -8.45, ZP + 1.75), 3.0, 'white', 0.24)
rp = board('recovery', 'panel', 'state_recovery')
rp.text('KHÔI PHỤC QUYỀN BIỂU QUYẾT', 0.3, (0, -0.4, 4.6), 'state_recovery', depth=0.07)
rp.text('72%', 1.0, (0, -0.4, 3.75), 'state_recovery', depth=0.08)
rp.pop()
progress_bar(b, 'recovery', 'progress', (BX, BY - 0.25, ZS + 2.75), 5.0, 0.4, 0.72, 'steel_dark', 'state_recovery', 0.2, 0.18)
glow_ring(b, 'recovery', 'safe_ring', (0, 1.0, ZS + 0.4), 17.0, 16.5, 'state_recovery', 0.2, 96)
cl = b.sp('recovery', 'checklist', ['state_recovery', 'steel_dark', SIGN, 'screen_dark'])
cl.push((9.0, -11.2, ZS), (0, 0, -0.18))
for dx in (-2.2, 2.2):
    cbox(cl, (0.4, 0.4, 2.4), (dx, 0, 0), 'steel_dark', base=True, bev=0.1, seg=2)
cl.box((5.2, 0.4, 2.8), (0, 0, 3.5), 'state_recovery', bev=0.2, seg=2); cl.box((4.7, 0.2, 2.3), (0, -0.2, 3.5), 'screen_dark')
for i, t in enumerate(('Kiểm tra phiên họp', 'Xác minh quorum', 'Mở lại biểu quyết')):
    cl.box((0.34, 0.1, 0.34), (-2.0, -0.4, 4.2 - i * 0.7), 'state_recovery')
    cl.text(t, 0.3, (-1.65, -0.4, 4.2 - i * 0.7), 'state_recovery', depth=0.05, align='LEFT')
cl.pop()

total = b.finish()
bpy.context.view_layer.update()
print(CODE, 'tris', total, 'objs', len(b.coll.objects))
if PREVIEW:
    cartoon_preview(CODE, center=(0, 0, 7), scale=52, states=STATES)
    print('preview done')
