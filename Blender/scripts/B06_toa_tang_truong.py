# B06 - Toa Tang Truong (16 x 14 x 14 m) - CARTOON / TOY version (REF_07 / REF_08 look).
# Chunky violet 2-step block, big 3D rising-bar chart + golden arrow emblem, warm yellow windows, rounded 22x20 plot.
# Run: Blender -b --factory-startup -P B06_toa_tang_truong.py     (env B_PREVIEW=none|normal|all, B_EXPORT=0/1)
exec(open('/Users/mac/Documents/Cordon/Blender/scripts/common_B06_B07.py').read(), globals())
CODE = 'B06'
b = Bld(CODE, 'Tòa Tăng Trưởng', '16x14x14', 17.0)
cartoon_materials()

# ------------------------------------------------------------------ materials (matte, saturated)
MAT('B06_identity', '#8A4EFF', 0.62, 0.0)
MAT('B06_glow', '#E065FF', 0.3, 0.0, '#E065FF', 3.0)
MAT('B06_trim', '#F3F0FF', 0.7, 0.0)
MAT('B06_deck', '#B9A6FF', 0.75, 0.0)
MAT('B06_panel', '#4A21B8', 0.65, 0.0)
MAT('B06_door', '#3B1C8E', 0.6, 0.0)
MAT('B06_window', '#FFD66B', 0.5, 0.0, '#FFB947', 1.5)
MAT('B06_chart', '#FFC826', 0.45, 0.0, '#FFB300', 1.6)
MAT('B06_bar', '#FFFFFF', 0.6, 0.0, '#E9E4FF', 0.25)
MAT('B06_ui_white', '#FFFFFF', 0.4, 0.0, '#FFFFFF', 1.8)
MAT('B06_sign', '#1B1550', 0.5, 0.0)
MAT('B_tint_warning', '#FFB300', 0.5, 0.0, '#FFB300', 0.7, alpha=0.30)
MAT('B_tint_incident', '#FF2D3D', 0.5, 0.0, '#FF2D3D', 0.9, alpha=0.34)
MAT('B_tint_recovery', '#7BA2BA', 0.5, 0.0, '#5E8FA3', 0.4, alpha=0.52)
MAT('B_dome_recovery', '#6FD3E6', 0.15, 0.0, '#58C8D8', 0.6, alpha=0.18)
MAT('B_rec_dark', '#2F5A6E', 0.6, 0.0)
ID, GL, TR, DK, PN, WN, CH, BAR = 'B06_identity', 'B06_glow', 'B06_trim', 'B06_deck', 'B06_panel', 'B06_window', 'B06_chart', 'B06_bar'

# ------------------------------------------------------------------ constants (plot 22x20, building footprint 16x14)
GZ = 1.15                      # lawn top
HWL, YFL, YBL = 7.4, -4.6, 6.4   # lower block half-width / front / back
YC = (YFL + YBL) / 2
HDL = (YBL - YFL) / 2
LH = 6.2                       # lower block height
ZL = GZ + LH + 0.5             # lower roof deck level
UXC, UW, YFU = 1.2, 10.6, -1.6   # upper block centre x, width, front y
YCU = (YFU + YBL) / 2
UH = 5.2
ZU = ZL + UH + 0.5             # upper roof deck level (top of rim)
PZ = ZL + 2.6                  # emblem centre z

# ------------------------------------------------------------------ plot
pl = b.part('plot', ['c_curb', 'c_sidewalk', 'c_lawn', 'c_paver', 'c_lawn_dark'])
cplot(pl, 0, 0, 22, 20, 0.0)
pl.box((4.2, 2.4, 0.06), (0, -5.9, GZ), 'c_paver', base=True, bev=0.02, seg=1)      # entrance path on the lawn
pl.box((4.2, 2.3, 0.06), (0, -8.0, 0.9), 'c_paver', base=True, bev=0.02, seg=1)     # ... and across the sidewalk

# ------------------------------------------------------------------ building: lower block + set-back upper block
wall = b.part('wall', [ID, TR, DK, GL])
bx(wall, (HWL * 2, HDL * 2, LH), (0, YC, GZ), ID, bev=0.4, seg=3, base=True)
bx(wall, (HWL * 2 + 0.55, HDL * 2 + 0.55, 0.5), (0, YC, GZ + 3.2), TR, bev=0.2, seg=2)                 # floor band
bx(wall, (HWL * 2 + 0.9, HDL * 2 + 0.9, 0.55), (0, YC, GZ + LH), TR, bev=0.25, seg=3, base=True)       # roof rim
bx(wall, (HWL * 2 - 0.4, HDL * 2 - 0.4, 0.12), (0, YC, GZ + LH + 0.5), DK, bev=0.04, seg=1, base=True)
bx(wall, (UW, YBL - YFU, UH), (UXC, YCU, ZL), ID, bev=0.4, seg=3, base=True)
bx(wall, (UW + 0.9, YBL - YFU + 0.9, 0.55), (UXC, YCU, ZL + UH), TR, bev=0.25, seg=3, base=True)
bx(wall, (UW - 0.4, YBL - YFU - 0.4, 0.12), (UXC, YCU, ZL + UH + 0.5), DK, bev=0.04, seg=1, base=True)
for (cx, cy, w, d, z) in ((0, YC, HWL * 2 + 0.95, HDL * 2 + 0.95, GZ + LH + 0.04), (UXC, YCU, UW + 0.95, YBL - YFU + 0.95, ZL + UH + 0.04)):
    for sy in (-1, 1):
        wall.box((w - 0.6, 0.1, 0.1), (cx, cy + sy * (d / 2 + 0.04), z), GL)
    for sx in (-1, 1):
        wall.box((0.1, d - 0.6, 0.1), (cx + sx * (w / 2 + 0.04), cy, z), GL)

# ------------------------------------------------------------------ emblem: rising 3D bars + golden arrow
em = b.part('facade_chart', [TR, PN, GL, BAR, CH, ID])
PY = YFU
bx(em, (9.9, 0.7, 5.0), (UXC, PY - 0.2, PZ), TR, bev=0.28, seg=3)
bx(em, (9.2, 0.5, 4.3), (UXC, PY - 0.45, PZ), PN, bev=0.2, seg=3)
em.box((8.9, 0.08, 0.1), (UXC, PY - 0.74, PZ + 1.95), GL); em.box((8.9, 0.08, 0.1), (UXC, PY - 0.74, PZ - 1.95), GL)
for sx in (-1, 1):
    em.box((0.1, 0.08, 3.9), (UXC + sx * 4.45, PY - 0.74, PZ), GL)
em.push((UXC, PY - 0.7, PZ - 1.55), (0, 0, 0))
for i, hh in enumerate((1.2, 1.9, 2.6, 3.3)):
    bx(em, (1.2, 1.0, hh), (-2.55 + i * 1.7, -0.5, 0), BAR, bev=0.22, seg=3, base=True)
    bx(em, (1.0, 0.1, 0.22), (-2.55 + i * 1.7, -1.02, hh - 0.35), GL, bev=0.05, seg=1)
pts = [(-3.5, 0.55), (-1.85, 1.3), (-0.55, 0.9), (0.9, 2.2), (2.0, 1.85), (3.3, 3.2)]
for (p0, p1) in zip(pts[:-1], pts[1:]):
    L = math.hypot(p1[0] - p0[0], p1[1] - p0[1]); a = math.atan2(p1[1] - p0[1], p1[0] - p0[0])
    bx(em, (L + 0.3, 0.6, 0.55), ((p0[0] + p1[0]) / 2, -1.25, (p0[1] + p1[1]) / 2), CH, rot=(0, -a, 0), bev=0.18, seg=2)
for (x, z) in pts[:-1]:
    em.sphere(0.42, (x, -1.25, z), CH, sub=2)
arrow_head(em, (3.35, -1.25, 3.3), 1.35, CH, 0.62, 0.6)
em.pop()

# ------------------------------------------------------------------ windows (warm yellow, white chunky frames)
win = b.part('windows', [TR, WN])
for sx in (-4.8, 4.8):
    cwin(win, sx, GZ + 1.75, 3.2, 2.2, HDL, 0.0, (0, YC), TR, WN, 3, 2)
for sx in (-5.1, -1.7, 1.7, 5.1):
    cwin(win, sx, GZ + 4.75, 2.0, 2.0, HDL, 0.0, (0, YC), TR, WN, 2, 2)
for rz, sg in ((pi / 2, 1), (-pi / 2, -1)):
    for z in (GZ + 1.75, GZ + 4.75):
        for u in (-3.0, 0.0, 3.0):
            cwin(win, u * sg, z, 2.0, 2.0 if z > GZ + 3 else 2.2, HWL, rz, (0, YC), TR, WN, 2, 2)
for rz, sg in ((pi / 2, 1), (-pi / 2, -1)):                                                         # upper block sides
    xw = UXC + sg * UW / 2
    for u in (-0.4, 3.2):
        cwin(win, u * sg, ZL + 2.2, 1.9, 2.2, abs(xw), rz, (0, YCU), TR, WN, 2, 2) if sg > 0 else cwin(win, u * sg, ZL + 2.2, 1.9, 2.2, abs(xw), rz, (0, YCU), TR, WN, 2, 2)
for u in (-4.5, -1.5, 1.5, 4.5):
    cwin(win, u, GZ + 1.75, 2.0, 2.2, HDL, pi, (0, YC), TR, WN, 2, 2)
    cwin(win, u, GZ + 4.75, 2.0, 2.0, HDL, pi, (0, YC), TR, WN, 2, 2)

# ------------------------------------------------------------------ entrance: door + canopy + steps
dr = b.part('door', [TR, 'B06_door', WN, 'c_pole_post', GL, ID, DK])
bx(dr, (3.6, 0.7, 4.0), (0, YFL - 0.1, GZ), TR, bev=0.18, seg=2, base=True)
bx(dr, (2.7, 0.35, 3.5), (0, YFL - 0.42, GZ), 'B06_door', bev=0.12, seg=2, base=True)
for dx in (-0.65, 0.65):
    bx(dr, (0.95, 0.2, 1.7), (dx, YFL - 0.62, GZ + 1.3), WN, bev=0.06, seg=1)
bx(dr, (5.2, 2.2, 0.45), (0, YFL - 1.1, GZ + 4.1), TR, bev=0.2, seg=3)
bx(dr, (4.8, 1.8, 0.1), (0, YFL - 1.05, GZ + 4.4), ID, bev=0.04, seg=1)
dr.box((4.8, 0.1, 0.1), (0, YFL - 2.2, GZ + 3.85), GL)
for sx in (-1, 1):
    dr.cyl(0.26, 4.1, (sx * 2.2, YFL - 1.85, GZ), TR, verts=12, smooth=True)
bx(dr, (5.4, 0.9, 0.3), (0, YFL - 1.2, GZ), DK, bev=0.1, seg=2, base=True) if False else None
for k, (w_, y_, h_) in enumerate(((5.2, -5.35, 0.3), (5.8, -6.15, 0.18))):
    bx(dr, (w_, 0.9, h_), (0, y_, GZ), DK, bev=0.08, seg=2, base=True)

# ------------------------------------------------------------------ props: planters, trees, lamps, bench, people
tt = b.part('trees_trunk', ['c_trunk']); tl = b.part('trees_leaf', ['c_leaf_a', 'c_leaf_b', 'c_leaf_c', 'c_leaf_pink', 'flower_pink'])
for (x, y, k, s) in ((-9.0, 1.0, 2, 0.95), (9.1, 3.5, 0, 0.9), (-9.2, 7.6, 0, 0.8)):
    rtree(tt, tl, (x, y, 0.9), s, k)
pr = b.part('props', ['c_bush', 'c_pole_post', 'c_lamp_glow', 'c_bench', 'c_shirt_a', 'c_shirt_b', 'c_shirt_c', 'c_pants', 'c_skin', 'c_hair',
                      'B06_trim', 'c_leaf_a', 'flower_pink', 'flower_yellow', 'c_vest'])
for sx in (-1, 1):
    bx(pr, (1.9, 1.5, 0.8), (sx * 3.7, -5.7, GZ), 'B06_trim', bev=0.2, seg=2, base=True)
    pr.sphere(0.95, (sx * 3.7, -5.7, GZ + 1.25), 'c_bush', sub=2)
    pr.sphere(0.28, (sx * 3.7 + 0.5, -6.1, GZ + 1.75), 'flower_pink', sub=1)
    pr.sphere(0.28, (sx * 3.7 - 0.45, -6.15, GZ + 1.65), 'flower_yellow', sub=1)
for p in ((-5.6, -3.4, ZL + 0.12), (-6.4, -2.6, ZL + 0.12)):
    pr.sphere(0.8, (p[0], p[1], p[2] + 0.7), 'c_bush', sub=2)
for (x, y) in ((-9.0, -8.1), (9.0, -8.1), (-9.0, 7.9), (9.0, 8.0)):
    clamp_post(pr, (x, y, 0.9), 3.4)
cbench(pr, (6.3, -8.1, 0.9), 0.0)
cperson(pr, (3.2, -8.5, 0.9), pi, 'c_shirt_b', 1.0)
cperson(pr, (-3.3, -8.2, 0.9), pi, 'c_shirt_a', 1.0)
cperson(pr, (7.3, -7.8, 0.9), pi, 'c_shirt_c', 0.75)
pad = b.part('roof_pedestal', ['c_pole_post'])
BX_, BY_ = UXC, YCU + 1.0
pad.cyl(1.0, 0.6, (BX_, BY_, ZU + 0.12), 'c_pole_post', verts=16, bev=0.06, smooth=True)
BCN = (BX_, BY_, ZU + 0.72)

# ====================================================================== STATES
SPOS = (-6.2, -8.4, 0.9); SRZ = 0.35
def board(s, texts, m_edge, w=4.6, h=2.4):
    csign(s, SPOS, SRZ, w, h, 'B06_sign', m_edge)
    s.push(SPOS, (0, 0, SRZ))
    for (t, size, dz, m) in texts:
        txt(s, t, size, (0, -0.3, 2.1 + h / 2 + dz), m, depth=0.06)
    s.pop()

def rim_tint(st, m):
    tint_overlay(b, st, [((HWL * 2, HDL * 2, LH), (0, YC, GZ), 0.4), ((UW, YBL - YFU, UH), (UXC, YCU, ZL), 0.4)], m)

def ring_state(st, m):
    r = b.sp(st, 'ring', [m], origin=(0, 0, 0.95))
    rrect_ring(r, 0, 0, 20.4, 18.4, 2.8, 0.95, 0.28, 0.16, m)

def chart_overlay(st, name, panel='B06_panel'):
    s = b.sp(st, name, ['state_warning', 'state_incident', 'state_recovery', panel])
    s.push((UXC, PY - 1.7, PZ), (0, 0, 0))
    bx(s, (8.5, 0.35, 3.7), (0, 0.9, 0), panel, bev=0.15, seg=2)
    return s

def poly3d(s, pts, m, y, w=0.5, ball=0.36):
    for (p0, p1) in zip(pts[:-1], pts[1:]):
        L = math.hypot(p1[0] - p0[0], p1[1] - p0[1]); a = math.atan2(p1[1] - p0[1], p1[0] - p0[0])
        bx(s, (L + 0.25, w, w), ((p0[0] + p1[0]) / 2, y, (p0[1] + p1[1]) / 2), m, rot=(0, -a, 0), bev=0.15, seg=2)
    for (x, z) in pts[:-1]:
        s.sphere(ball, (x, y, z), m, sub=2)

def alarm_sign(st, m, glyph, big=1.0, name='alarm_sign'):
    z = BCN[2] + 3.7 * big
    s = b.sp(st, name, [m, 'hazard_black', 'B06_ui_white'], origin=(BCN[0], BCN[1], z))
    s.prism([(0, 1.45 * big), (1.5 * big, -1.1 * big), (-1.5 * big, -1.1 * big)], 0.55, (BCN[0], BCN[1], z), m)
    s.prism([(0, 0.85 * big), (0.92 * big, -0.68 * big), (-0.92 * big, -0.68 * big)], 0.1, (BCN[0], BCN[1] - 0.32, z), glyph)
    s.box((0.3 * big, 0.2, 0.8 * big), (BCN[0], BCN[1] - 0.42, z + 0.05), m); s.sphere(0.19 * big, (BCN[0], BCN[1] - 0.42, z - 0.55 * big), m, sub=1)

# ---- NORMAL: ROI positive, bars rising, steady lights
nb = b.sp('normal', 'roi_sign', ['B06_sign', 'c_pole_post', 'state_ok', 'B06_ui_white'])
board(nb, [('ROI', 0.5, 0.62, 'B06_ui_white'), ('+5,2%', 1.0, -0.15, 'state_ok')], 'state_ok')
progress_bar(b, 'normal', 'progress', (SPOS[0] - 0.15, SPOS[1] - 0.45, 2.45), 3.6, 0.32, 0.52, 'c_pole_post', 'state_ok', 0.2, SRZ)
sp_ = b.sp('normal', 'chart_sparkles', [CH], origin=(UXC, PY - 0.9, PZ))
for (x, z) in ((UXC + 5.2, PZ + 2.5), (UXC - 5.2, PZ + 2.0), (UXC + 5.3, PZ - 1.6)):
    sp_.prism([(0, .5), (.14, .14), (.5, 0), (.14, -.14), (0, -.5), (-.14, -.14), (-.5, 0), (-.14, .14)], 0.14, (x, PY - 1.0, z), CH)
ring_state('normal', GL)
csiren(b, 'normal', 'beacon', BCN, 0.6, 'state_ok', beams=False)

# ---- WARNING: market volatility / risk 62% -> amber jagged chart, amber light, tint
wb = b.sp('warning', 'risk_sign', ['B06_sign', 'c_pole_post', 'state_warning', 'B06_ui_white'])
board(wb, [('RỦI RO', 0.5, 0.62, 'B06_ui_white'), ('62%', 1.0, -0.15, 'state_warning')], 'state_warning')
wo = chart_overlay('warning', 'chart_volatile')
poly3d(wo, [(-3.4, -0.6), (-2.4, 1.2), (-1.4, -0.9), (-0.3, 1.5), (0.8, -0.6), (1.9, 1.3), (3.3, 0.2)], 'state_warning', 0.45)
wo.pop()
alarm_sign('warning', 'state_warning', 'hazard_black', 0.9)
ring_state('warning', 'state_warning')
csiren(b, 'warning', 'beacon', BCN, 0.55, 'state_warning')
rim_tint('warning', 'B_tint_warning')

# ---- INCIDENT: runaway / loss over threshold -> AUTO-PAUSE, red falling chart, caution tape, sirens
io = chart_overlay('incident', 'chart_crash')
for i, hh in enumerate((3.2, 2.5, 1.8, 1.1)):
    bx(io, (1.1, 0.8, hh), (-2.55 + i * 1.7, 0.4, -1.55), 'state_incident', bev=0.2, seg=2, base=True)
poly3d(io, [(-3.4, 1.4), (-1.8, 0.6), (-0.6, 1.0), (0.9, -0.5), (2.0, -0.1), (3.0, -1.2)], 'state_incident', 0.55, 0.5, 0.0001) if False else None
for (p0, p1) in zip([(-3.4, 1.4), (-1.8, 0.6), (-0.6, 1.0), (0.9, -0.5), (2.0, -0.1)], [(-1.8, 0.6), (-0.6, 1.0), (0.9, -0.5), (2.0, -0.1), (3.0, -1.2)]):
    L = math.hypot(p1[0] - p0[0], p1[1] - p0[1]); a = math.atan2(p1[1] - p0[1], p1[0] - p0[0])
    bx(io, (L + 0.25, 0.55, 0.5), ((p0[0] + p1[0]) / 2, 0.55, (p0[1] + p1[1]) / 2), 'state_incident', rot=(0, -a, 0), bev=0.15, seg=2)
arrow_head(io, (3.2, 0.55, -1.45), 1.25, 'state_incident', -0.95, 0.55)
io.pop()
ib = b.sp('incident', 'pause_sign', ['B06_sign', 'c_pole_post', 'state_incident', 'B06_ui_white'])
board(ib, [('AUTO-PAUSE', 0.55, 0.42, 'state_incident'), ('ĐÃ KÍCH HOẠT', 0.34, -0.42, 'B06_ui_white')], 'state_incident')
alarm_sign('incident', 'state_incident', 'B06_ui_white', 1.05)
tape_barrier(b, 'incident', 'barrier', [(-10.2, -2.2), (-10.2, -8.9), (-4.4, -9.5), (4.4, -9.5), (10.2, -8.9), (10.2, -2.2)], 0.9)
csiren(b, 'incident', 'beacon', BCN, 0.62, 'state_incident')
csiren(b, 'incident', 'beacon_L', (-9.4, -7.4, 0.9), 0.5, 'state_incident')
csiren(b, 'incident', 'beacon_R', (9.4, -7.4, 0.9), 0.5, 'state_incident')
ring_state('incident', 'state_incident')
rim_tint('incident', 'B_tint_incident')

# ---- RECOVERY: rebalance to safe mode -> shield dome, 68% progress, blue-grey tint
rs = b.sp('recovery', 'shield', ['state_recovery', 'B_rec_dark', 'B06_ui_white'], origin=(BCN[0], BCN[1], BCN[2] + 3.9))
rs.prism(SHIELD, 0.55, (BCN[0], BCN[1], BCN[2] + 3.9), 'state_recovery', scale=3.4)
rs.prism(SHIELD, 0.2, (BCN[0], BCN[1] - 0.36, BCN[2] + 3.9), 'B_rec_dark', scale=2.6)
check2(rs, (BCN[0], BCN[1] - 0.52, BCN[2] + 3.95), 2.0, 'B06_ui_white', 0.22)
dm = b.sp('recovery', 'shield_dome', ['B_dome_recovery'], origin=(0, 0, 0.9))
cdome(dm, 10.4, 9.2, 15.5, (0, 0.2, 0.9), 'B_dome_recovery')
rb = b.sp('recovery', 'progress_sign', ['B06_sign', 'c_pole_post', 'state_recovery', 'B06_ui_white'])
board(rb, [('TÁI CÂN BẰNG', 0.36, 0.7, 'B06_ui_white'), ('68%', 1.0, -0.15, 'state_recovery')], 'state_recovery')
progress_bar(b, 'recovery', 'progress', (SPOS[0] - 0.15, SPOS[1] - 0.45, 2.45), 3.6, 0.32, 0.68, 'c_pole_post', 'state_recovery', 0.2, SRZ)
ring_state('recovery', 'state_recovery')
csiren(b, 'recovery', 'beacon', BCN, 0.6, 'state_recovery', beams=False)
rim_tint('recovery', 'B_tint_recovery')

# ------------------------------------------------------------------ finish / save / export / preview
total = finalize_and_save(b, CODE)
print(CODE, 'TRIS', total, 'objs', len(b.coll.objects))
if os.environ.get('B_EXPORT', '1') == '1':
    export_glb(CODE)
mode = os.environ.get('B_PREVIEW', 'all')
if mode != 'none':
    render_cartoon(CODE, STATES if mode == 'all' else [mode], center_z=8.0, scale=38)
    print('previews done')
