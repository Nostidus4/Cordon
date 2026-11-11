# B07 - Toa Trach Nhiem (16 x 14 x 12 m) - CARTOON / TOY version (REF_07 / REF_08 look).
# Chunky green block with a big glowing 3D leaf emblem, warm windows, green roof garden, rounded 22x20 plot.
# Run: Blender -b --factory-startup -P B07_toa_trach_nhiem.py     (env B_PREVIEW=none|normal|all, B_EXPORT=0/1)
exec(open('/Users/mac/Documents/Cordon/Blender/scripts/common_B06_B07.py').read(), globals())
CODE = 'B07'
b = Bld(CODE, 'Tòa Trách Nhiệm', '16x14x12', 15.0)
cartoon_materials()

MAT('B07_identity', '#22C55E', 0.62, 0.0)
MAT('B07_glow', '#00FF9D', 0.3, 0.0, '#00FF9D', 2.6)
MAT('B07_trim', '#F2FBF4', 0.7, 0.0)
MAT('B07_deck', '#9FE0B0', 0.75, 0.0)
MAT('B07_panel', '#0F7A3A', 0.65, 0.0)
MAT('B07_door', '#0E5A2C', 0.6, 0.0)
MAT('B07_window', '#FFE07A', 0.5, 0.0, '#FFC94D', 1.5)
MAT('B07_leaf', '#00FF9D', 0.4, 0.0, '#00FF9D', 2.4)
MAT('B07_leaf_vein', '#0F7A3A', 0.6, 0.0)
MAT('B07_ui_white', '#FFFFFF', 0.4, 0.0, '#FFFFFF', 1.8)
MAT('B07_sign', '#0A2A1C', 0.5, 0.0)
MAT('B07_green_roof', '#59B94A', 0.8, 0.0)
MAT('B_tint_warning', '#FFB300', 0.5, 0.0, '#FFB300', 0.7, alpha=0.30)
MAT('B_tint_incident', '#FF2D3D', 0.5, 0.0, '#FF2D3D', 0.9, alpha=0.34)
MAT('B_tint_recovery', '#7BA2BA', 0.5, 0.0, '#5E8FA3', 0.4, alpha=0.52)
MAT('B_dome_recovery', '#6FD3E6', 0.15, 0.0, '#58C8D8', 0.6, alpha=0.18)
MAT('B_rec_dark', '#2F5A6E', 0.6, 0.0)
ID, GL, TR, DK, PN, WN = 'B07_identity', 'B07_glow', 'B07_trim', 'B07_deck', 'B07_panel', 'B07_window'

GZ = 1.15
HW, YF, YB = 7.4, -4.6, 6.4
YC = (YF + YB) / 2; HD = (YB - YF) / 2
H = 8.6
ZR = GZ + H + 0.5
EX, EZ = 3.2, GZ + 5.6          # emblem centre x (right half of facade), z

pl = b.part('plot', ['c_curb', 'c_sidewalk', 'c_lawn', 'c_paver'])
cplot(pl, 0, 0, 22, 20, 0.0)
pl.box((4.2, 2.4, 0.06), (-2.6, -5.9, GZ), 'c_paver', base=True, bev=0.02, seg=1)
pl.box((4.2, 2.3, 0.06), (-2.6, -8.0, 0.9), 'c_paver', base=True, bev=0.02, seg=1)

wall = b.part('wall', [ID, TR, DK, GL])
bx(wall, (HW * 2, HD * 2, H), (0, YC, GZ), ID, bev=0.4, seg=3, base=True)
bx(wall, (HW * 2 + 0.55, HD * 2 + 0.55, 0.5), (0, YC, GZ + 3.4), TR, bev=0.2, seg=2)
bx(wall, (HW * 2 + 0.9, HD * 2 + 0.9, 0.55), (0, YC, GZ + H), TR, bev=0.25, seg=3, base=True)
bx(wall, (HW * 2 - 0.4, HD * 2 - 0.4, 0.12), (0, YC, GZ + H + 0.5), 'B07_green_roof', bev=0.04, seg=1, base=True)
w_, d_ = HW * 2 + 0.95, HD * 2 + 0.95
for sy in (-1, 1):
    wall.box((w_ - 0.6, 0.1, 0.1), (0, YC + sy * (d_ / 2 + 0.04), GZ + H + 0.04), GL)
for sx in (-1, 1):
    wall.box((0.1, d_ - 0.6, 0.1), (sx * (w_ / 2 + 0.04), YC, GZ + H + 0.04), GL)

# big leaf emblem
em = b.part('logo_leaf', [TR, PN, GL, 'B07_leaf', 'B07_leaf_vein', ID])
EY = YF
bx(em, (6.6, 0.7, 6.4), (EX, EY - 0.2, EZ), TR, bev=0.3, seg=3)
bx(em, (5.9, 0.5, 5.7), (EX, EY - 0.45, EZ), PN, bev=0.22, seg=3)
em.ring(2.75, 2.55, 0.1, (EX, EY - 0.75, EZ), GL, rot=(pi / 2, 0, 0), seg=48)
em.push((EX, EY - 0.75, EZ), (0, 0, 0))
P = leaf_pts(w=0.34, L=0.66)
c_, s_ = cos(0.6), sin(0.6)
pts = [((px * c_ + py * s_), (-px * s_ + py * c_)) for px, py in P]
em.prism(pts, 0.55, (0, -0.15, 0), 'B07_leaf', scale=3.6)
for k in (0.0, 0.3, -0.3):
    pass
bx(em, (0.22, 0.2, 4.6), (0, -0.55, 0), 'B07_leaf_vein', rot=(0, 0.6, 0), bev=0.08, seg=1)
for t in (-0.8, 0.2, 1.1):
    for sg in (-1, 1):
        em.box((0.14, 0.2, 1.3), (0.55 * sg * 0.5 + 0.0, -0.55, 0), 'B07_leaf_vein', rot=(0, 0.6, 0)) if False else None
em.pop()

# windows
win = b.part('windows', [TR, WN])
for z in (GZ + 1.9, GZ + 5.9):
    for sx in (-5.2, -2.2) if z > GZ + 3 else (-5.5, 6.0):
        cwin(win, sx, z, 2.3, 2.3, HD, 0.0, (0, YC), TR, WN, 2, 2)
cwin(win, 6.0, GZ + 1.9, 2.3, 2.3, HD, 0.0, (0, YC), TR, WN, 2, 2) if False else None
for rz, sg in ((pi / 2, 1), (-pi / 2, -1)):
    for z in (GZ + 1.9, GZ + 5.9):
        for u in (-3.0, 0.0, 3.0):
            cwin(win, u * sg, z, 2.0, 2.3, HW, rz, (0, YC), TR, WN, 2, 2)
for u in (-4.5, -1.5, 1.5, 4.5):
    for z in (GZ + 1.9, GZ + 5.9):
        cwin(win, u, z, 2.0, 2.3, HD, pi, (0, YC), TR, WN, 2, 2)

# door + canopy (left of emblem)
DX = -2.6
dr = b.part('door', [TR, 'B07_door', WN, GL, ID, DK, 'B07_sign'])
bx(dr, (3.6, 0.7, 4.0), (DX, YF - 0.1, GZ), TR, bev=0.18, seg=2, base=True)
bx(dr, (2.7, 0.35, 3.5), (DX, YF - 0.42, GZ), 'B07_door', bev=0.12, seg=2, base=True)
for dx in (-0.65, 0.65):
    bx(dr, (0.95, 0.2, 1.7), (DX + dx, YF - 0.62, GZ + 1.3), WN, bev=0.06, seg=1)
bx(dr, (5.2, 2.2, 0.45), (DX, YF - 1.1, GZ + 4.1), TR, bev=0.2, seg=3)
bx(dr, (4.8, 1.8, 0.1), (DX, YF - 1.05, GZ + 4.4), ID, bev=0.04, seg=1)
dr.box((4.8, 0.1, 0.1), (DX, YF - 2.2, GZ + 3.85), GL)
for sx in (-1, 1):
    dr.cyl(0.26, 4.1, (DX + sx * 2.2, YF - 1.85, GZ), TR, verts=12, smooth=True)
for (w2, y2, h2) in ((5.2, -5.35, 0.3), (5.8, -6.15, 0.18)):
    bx(dr, (w2, 0.9, h2), (DX, y2, GZ), DK, bev=0.08, seg=2, base=True)
# roof garden: bushes + a small leaf-tree
rg = b.part('roof_garden', ['c_bush', 'c_trunk', 'c_leaf_b', 'flower_pink', 'flower_yellow', 'c_pole_post'])
for (x, y, s) in ((-4.5, -2.0, 0.9), (-3.4, -2.6, 0.7), (4.8, 4.8, 0.9), (-5.0, 4.2, 0.8)):
    rg.sphere(0.9 * s, (x, y, ZR + 0.65), 'c_bush', sub=2)
rg.sphere(0.25, (-4.1, -2.9, ZR + 1.5), 'flower_pink', sub=1); rg.sphere(0.25, (5.2, 4.3, ZR + 1.5), 'flower_yellow', sub=1)
rg.cyl(1.0, 0.6, (0.0, YC + 1.0, ZR + 0.12), 'c_pole_post', verts=16, bev=0.06, smooth=True)
BCN = (0.0, YC + 1.0, ZR + 0.72)

# props
tt = b.part('trees_trunk', ['c_trunk']); tl = b.part('trees_leaf', ['c_leaf_a', 'c_leaf_b', 'c_leaf_c', 'c_leaf_pink', 'flower_pink'])
for (x, y, k, s) in ((-9.0, 1.5, 0, 0.95), (9.1, -0.5, 2, 0.9), (9.2, 7.6, 0, 0.8)):
    rtree(tt, tl, (x, y, 0.9), s, k)
pr = b.part('props', ['c_bush', 'c_pole_post', 'c_lamp_glow', 'c_bench', 'c_shirt_a', 'c_shirt_b', 'c_shirt_c', 'c_shirt_d', 'c_pants', 'c_skin', 'c_hair', 'B07_trim', 'flower_pink', 'flower_yellow', 'c_vest'])
for sx in (-1, 1):
    bx(pr, (1.9, 1.5, 0.8), (DX + sx * 3.7, -5.7, GZ), 'B07_trim', bev=0.2, seg=2, base=True)
    pr.sphere(0.95, (DX + sx * 3.7, -5.7, GZ + 1.25), 'c_bush', sub=2)
    pr.sphere(0.28, (DX + sx * 3.7 + 0.5, -6.1, GZ + 1.75), 'flower_yellow' if sx > 0 else 'flower_pink', sub=1)
for (x, y) in ((-9.0, -8.1), (9.0, -8.1), (-9.0, 7.9), (9.0, 8.0)):
    clamp_post(pr, (x, y, 0.9), 3.4)
cbench(pr, (6.5, -8.1, 0.9), 0.0)
cperson(pr, (-0.2, -8.5, 0.9), pi, 'c_shirt_d', 1.0)
cperson(pr, (-5.4, -8.3, 0.9), pi, 'c_shirt_c', 1.0)
cperson(pr, (4.0, -8.0, 0.9), pi, 'c_shirt_a', 0.75)

# ================= states
SPOS = (6.8, -8.4, 0.9); SRZ = -0.35
def board(s, texts, m_edge, w=4.6, h=2.4):
    csign(s, SPOS, SRZ, w, h, 'B07_sign', m_edge)
    s.push(SPOS, (0, 0, SRZ))
    for (t, size, dz, m) in texts:
        txt(s, t, size, (0, -0.3, 2.1 + h / 2 + dz), m, depth=0.06)
    s.pop()
def rim_tint(st, m):
    tint_overlay(b, st, [((HW * 2, HD * 2, H), (0, YC, GZ), 0.4)], m)
def ring_state(st, m):
    r = b.sp(st, 'ring', [m], origin=(0, 0, 0.95))
    rrect_ring(r, 0, 0, 20.4, 18.4, 2.8, 0.95, 0.28, 0.16, m)
def alarm_sign(st, m, glyph, big=1.0):
    z = BCN[2] + 3.7 * big
    s = b.sp(st, 'alarm_sign', [m, 'hazard_black', 'B07_ui_white'], origin=(BCN[0], BCN[1], z))
    s.prism([(0, 1.45 * big), (1.5 * big, -1.1 * big), (-1.5 * big, -1.1 * big)], 0.55, (BCN[0], BCN[1], z), m)
    s.prism([(0, 0.85 * big), (0.92 * big, -0.68 * big), (-0.92 * big, -0.68 * big)], 0.1, (BCN[0], BCN[1] - 0.32, z), glyph)
    s.box((0.3 * big, 0.2, 0.8 * big), (BCN[0], BCN[1] - 0.42, z + 0.05), m); s.sphere(0.19 * big, (BCN[0], BCN[1] - 0.42, z - 0.55 * big), m, sub=1)
def leaf_overlay(st, m, name='leaf_overlay'):
    s = b.sp(st, name, [m], origin=(EX, EY - 1.4, EZ))
    s.push((EX, EY - 1.4, EZ), (0, 0, 0))
    s.prism(pts, 0.5, (0, 0, 0), m, scale=3.6)
    return s

# NORMAL: programs + compliance OK, green impact board
nb = b.sp('normal', 'impact_sign', ['B07_sign', 'c_pole_post', 'state_ok', 'B07_ui_white'])
board(nb, [('TÁC ĐỘNG', 0.42, 0.62, 'B07_ui_white'), ('+12.480', 0.85, -0.15, 'state_ok')], 'state_ok')
progress_bar(b, 'normal', 'progress', (SPOS[0] + 0.15, SPOS[1] - 0.45, 2.45), 3.6, 0.32, 0.94, 'c_pole_post', 'state_ok', 0.2, SRZ)
lf = b.sp('normal', 'leaf_sparkles', [GL], origin=(EX, EY - 1.0, EZ))
for (x, z) in ((EX + 3.6, EZ + 3.0), (EX - 3.5, EZ + 2.4), (EX + 3.7, EZ - 2.2)):
    lf.prism([(0, .5), (.14, .14), (.5, 0), (.14, -.14), (0, -.5), (-.14, -.14), (-.5, 0), (-.14, .14)], 0.14, (x, EY - 1.0, z), GL)
ring_state('normal', GL)
csiren(b, 'normal', 'beacon', BCN, 0.6, 'state_ok', beams=False)

# WARNING: missing impact docs -> amber leaf
wb = b.sp('warning', 'docs_sign', ['B07_sign', 'c_pole_post', 'state_warning', 'B07_ui_white'])
board(wb, [('CẦN BỔ SUNG', 0.4, 0.55, 'state_warning'), ('HỒ SƠ', 0.7, -0.2, 'B07_ui_white')], 'state_warning')
leaf_overlay('warning', 'state_warning')
alarm_sign('warning', 'state_warning', 'hazard_black', 0.9)
ring_state('warning', 'state_warning')
csiren(b, 'warning', 'beacon', BCN, 0.6, 'state_warning')
rim_tint('warning', 'B_tint_warning')

# INCIDENT: policy violation -> red crossed leaf, VI PHAM POLICY, tape barrier, sirens
ib = b.sp('incident', 'violation_sign', ['B07_sign', 'c_pole_post', 'state_incident', 'B07_ui_white'])
board(ib, [('VI PHẠM', 0.55, 0.5, 'state_incident'), ('POLICY', 0.55, -0.35, 'state_incident')], 'state_incident')
lo = leaf_overlay('incident', 'state_incident', 'leaf_red')
for a in (0.785, -0.785):
    lo.box((5.2, 0.5, 0.6), (0, -0.4, 0), 'state_incident', rot=(0, a, 0), bev=0.15, seg=2)
alarm_sign('incident', 'state_incident', 'B07_ui_white', 1.05)
tape_barrier(b, 'incident', 'barrier', [(-10.2, -2.2), (-10.2, -8.9), (-4.4, -9.5), (4.4, -9.5), (10.2, -8.9), (10.2, -2.2)], 0.9)
csiren(b, 'incident', 'beacon', BCN, 0.62, 'state_incident')
csiren(b, 'incident', 'beacon_L', (-9.4, -7.4, 0.9), 0.5, 'state_incident')
csiren(b, 'incident', 'beacon_R', (9.4, -7.4, 0.9), 0.5, 'state_incident')
ring_state('incident', 'state_incident')
rim_tint('incident', 'B_tint_incident')

# RECOVERY: review / resubmit / audit -> shield dome, progress, tint
rs = b.sp('recovery', 'shield', ['state_recovery', 'B_rec_dark', 'B07_ui_white'], origin=(BCN[0], BCN[1], BCN[2] + 3.9))
rs.prism(SHIELD, 0.55, (BCN[0], BCN[1], BCN[2] + 3.9), 'state_recovery', scale=3.4)
rs.prism(SHIELD, 0.2, (BCN[0], BCN[1] - 0.36, BCN[2] + 3.9), 'B_rec_dark', scale=2.6)
check2(rs, (BCN[0], BCN[1] - 0.52, BCN[2] + 3.95), 2.0, 'B07_ui_white', 0.22)
dm = b.sp('recovery', 'shield_dome', ['B_dome_recovery'], origin=(0, 0, 0.9))
cdome(dm, 10.4, 9.2, 15.5, (0, 0.2, 0.9), 'B_dome_recovery')
rb = b.sp('recovery', 'progress_sign', ['B07_sign', 'c_pole_post', 'state_recovery', 'B07_ui_white'])
board(rb, [('RÀ SOÁT', 0.45, 0.65, 'B07_ui_white'), ('66%', 0.95, -0.15, 'state_recovery')], 'state_recovery')
progress_bar(b, 'recovery', 'progress', (SPOS[0] + 0.15, SPOS[1] - 0.45, 2.45), 3.6, 0.32, 0.66, 'c_pole_post', 'state_recovery', 0.2, SRZ)
ring_state('recovery', 'state_recovery')
csiren(b, 'recovery', 'beacon', BCN, 0.6, 'state_recovery', beams=False)
rim_tint('recovery', 'B_tint_recovery')

total = finalize_and_save(b, CODE)
print(CODE, 'TRIS', total, 'objs', len(b.coll.objects))
if os.environ.get('B_EXPORT', '1') == '1':
    export_glb(CODE)
mode = os.environ.get('B_PREVIEW', 'all')
if mode != 'none':
    render_cartoon(CODE, STATES if mode == 'all' else [mode], center_z=5.0, scale=36)
    print('previews done')
