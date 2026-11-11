# B02 - Toa Giao Duc (16 x 14 x 14 m) - CARTOON/toy version (REF_07 / REF_08 look).
# Chunky blue school: stepped mass (low front block + tall rear block), BIG 3D open-book emblem, warm cross-mullion windows,
# canopy porch, light parapets, round cupola. Sits on a 22 x 20 plot. 4 own states at the end of the file.
exec(open('/Users/mac/Documents/Cordon/Blender/scripts/common_B02_B03.py').read(), globals())
PREVIEW = globals().get('PREVIEW', True)
EXPORT = globals().get('EXPORT', True)
CODE = 'B02'
fresh_scene()
b = Bld(CODE, 'Tòa Giáo Dục', '16x14x14', 16.5)
cartoon_materials()

# ------------------------------------------------------------------ materials (matte)
ID = CMAT('B02_identity', '#1565E8', rough=0.6)
GLW = CMAT('B02_glow', '#00E5FF', '#00E5FF', 3.2, rough=0.4)
ROOF = CMAT('B02_roof', '#3C8CFF', rough=0.65)
TRIM = CMAT('B02_trim', '#EAF3FF', rough=0.6)
TRIMD = CMAT('B02_trim_dark', '#B7D1F7', rough=0.65)
NAVY = CMAT('B02_navy', '#0B3FA8', rough=0.6)
AMB = CMAT('B02_amber', '#FFC857', rough=0.5)
PAGE = CMAT('B02_page', '#FFFFFF', '#CFE8FF', 0.45, rough=0.7)
PATH = CMAT('B02_path', '#DAD6F2', rough=0.7)
SIGN = CMAT('B02_sign_panel', '#0B1B44', rough=0.5)
GLASS = CMAT('B02_glass', '#8FD8FF', '#2E9BE0', 0.4, rough=0.15, alpha=0.4)
DOME = CMAT('B02_dome', '#58C8D8', '#58C8D8', 0.5, rough=0.2, alpha=0.12)
TINT_W = CMAT('B02_tint_warning', '#FFB300', '#FFB300', 0.8, rough=0.5, alpha=0.18)
TINT_I = CMAT('B02_tint_incident', '#FF2D3D', '#FF2D3D', 0.9, rough=0.5, alpha=0.24)
TINT_R = CMAT('B02_tint_recovery', '#8FA9BD', '#58C8D8', 0.35, rough=0.5, alpha=0.50)
IDN, GLN, ROOFN, TRIMN, TRIMDN, NAVYN, AMBN, PAGEN, PATHN = ('B02_identity', 'B02_glow', 'B02_roof', 'B02_trim', 'B02_trim_dark', 'B02_navy', 'B02_amber', 'B02_page', 'B02_path')

GZ = 1.15            # lawn top (plot) = plinth base
ZB = 1.65            # wall base (plinth top)
LT = 6.4             # lower block top
UT = 11.1            # upper block top
HWX = 8.0
YF = -7.0            # front wall of lower block
YJ = -1.5            # upper block front wall
YB = 7.0

# ------------------------------------------------------------------ plot (22 x 20)
g = b.part('plot', ['c_curb', 'c_sidewalk', 'c_lawn', PATHN, GLN])
cplot(g, 0, 0, 22, 20, 0.0, curb=0.5, walk=0.5)
for r in range(4):                                   # promenade pavers on the lawn
    for c in range(3):
        g.box((1.55, 1.45, 0.1), (-1.7 + c * 1.7, -8.6 - r * 1.1 + 0.0, GZ), PATHN, base=True, bev=0.08, seg=2) if False else None
g.box((5.0, 1.2, 0.1), (0, -9.5, 0.9), PATHN, base=True, bev=0.06, seg=2)
for sx in (-1, 1):
    g.box((0.12, 9.0, 0.06), (sx * 9.9, 0, 0.9), GLN, base=True)
    g.box((20.0, 0.12, 0.06), (0, sx * 9.4, 0.9), GLN, base=True) if False else None

# ------------------------------------------------------------------ mass
bd = b.part('body', [IDN, TRIMN, TRIMDN, ROOFN, NAVYN])
bd.box((16.8, 14.8, 0.5), (0, 0, GZ), TRIMDN, base=True, bev=0.2, seg=3)                       # plinth
cbox(bd, (16.0, 5.6, LT - ZB), (0, -4.2, ZB), IDN, base=True)                                    # low front block
cbox(bd, (15.9, 8.6, UT - ZB), (0, 2.75, ZB), IDN, base=True)                                    # tall rear block
# lower roof: light parapet + blue floor
bd.box((15.0, 4.6, 0.3), (0, -4.3, LT - 0.1), ROOFN, base=True, bev=0.05, seg=1)
cbox(bd, (16.6, 0.8, 0.9), (0, YF + 0.1, LT), TRIMN, base=True, bev=0.28)
for sx in (-1, 1):
    cbox(bd, (0.8, 5.4, 0.9), (sx * 7.95, -4.3, LT), TRIMN, base=True, bev=0.28)
# upper cornice + parapet + roof
cbox(bd, (16.9, 9.0, 0.6), (0, 2.75, UT), TRIMN, base=True, bev=0.22)
for yy in (YJ - 0.15, YB - 0.4):
    cbox(bd, (16.9, 0.8, 0.9), (0, yy, UT + 0.6), TRIMN, base=True, bev=0.28)
for sx in (-1, 1):
    cbox(bd, (0.8, 8.6, 0.9), (sx * 8.05, 2.75, UT + 0.6), TRIMN, base=True, bev=0.28)
bd.box((15.2, 7.6, 0.3), (0, 2.75, UT + 0.5), ROOFN, base=True, bev=0.05, seg=1)
for i in range(-3, 4):                               # roof seams
    bd.box((0.1, 7.4, 0.03), (i * 2.0, 2.75, UT + 0.8), 'B02_roof_dark') if False else None
# cupola (round cartoon lantern)
cp = b.part('cupola', [TRIMN, ROOFN, AMBN, 'window_warm', GLN])
CU = (0, 3.8, UT + 0.8)
cp.cyl(1.9, 0.9, CU, TRIMN, verts=14, bev=0.0, r2=1.7)
cp.ring(1.95, 1.7, 0.15, (CU[0], CU[1], CU[2] + 0.92), TRIMN, seg=14)
for k in range(4):
    a = k * pi / 2 + pi / 4
    cp.box((0.7, 0.14, 0.55), (cos(a) * 1.78, CU[1] + sin(a) * 1.78, CU[2] + 0.45), 'window_warm', rot=(0, 0, a + pi / 2))
cp.uvsphere(1.65, (CU[0], CU[1], CU[2] + 0.9), ROOFN, scale=(1, 1, 0.78), u=14, v=8)
cp.sphere(0.3, (CU[0], CU[1], CU[2] + 2.25), AMBN, sub=2)
cp.ring(1.72, 1.6, 0.14, (CU[0], CU[1], CU[2] + 0.88), GLN, seg=16)

# ------------------------------------------------------------------ neon accents
gl = b.part('glow', [GLN])
gl.box((16.7, 0.1, 0.1), (0, YF - 0.3, LT + 0.95), GLN)
gl.box((16.8, 0.1, 0.1), (0, YJ - 0.55, UT + 1.45), GLN)
for sx in (-1, 1):
    gl.box((0.1, 5.2, 0.1), (sx * 8.4, -4.3, LT + 0.95), GLN)
    gl.box((0.1, 8.2, 0.1), (sx * 8.45, 2.75, UT + 1.45), GLN)
    gl.box((0.14, 0.14, UT - ZB - 0.8), (sx * 8.2, YF - 0.12, ZB + 0.5), GLN, base=True) if False else None

# ------------------------------------------------------------------ windows
REC = []
fw = b.part('windows_front', [TRIMN, 'window_warm'])
for sx in (-1, 1):
    cwin(fw, sx * 5.4, 4.0, 2.6, 2.4, -YF, 0.0, (0, 0), TRIMN, rec=REC)                      # lower front
    cwin(fw, sx * 6.2, 8.9, 2.2, 3.0, -YJ, 0.0, (0, 0), TRIMN, rec=REC)                      # upper front flanks
sw = b.part('windows_side', [TRIMN, 'window_warm'])
for rz in (pi / 2, -pi / 2):
    sgn = 1 if rz > 0 else -1
    cwin(sw, sgn * -4.2, 4.0, 2.4, 2.4, HWX, rz, (0, 0), TRIMN, rec=REC)                      # lower block side
    for u in (1.2, 3.8, 6.1):
        for z in (4.0, 8.4):
            cwin(sw, sgn * u, z, 1.8, 2.4, HWX, rz, (0, 0), TRIMN, rec=REC)
bw = b.part('windows_back', [TRIMN, 'window_warm'])
for u in (-4.6, 0.0, 4.6):
    for z in (4.0, 8.4):
        cwin(bw, u, z, 2.2, 2.4, YB, pi, (0, 0), TRIMN, rec=REC)

# ------------------------------------------------------------------ door, canopy, steps
dr = b.part('door', [NAVYN, TRIMN, AMBN, 'window_warm', TRIMDN, 'c_leaf_a', 'c_trunk'])
DZ = ZB
rplate(dr, 4.2, 4.7, 0.3, (0, YF - 0.1, DZ + 2.35), TRIMN, r=0.9, seg=4)
rplate(dr, 3.6, 4.2, 0.3, (0, YF - 0.25, DZ + 2.1), NAVYN, r=0.75, seg=4)
rplate(dr, 3.0, 3.5, 0.2, (0, YF - 0.42, DZ + 2.3), 'window_warm', r=0.6, seg=4)
dr.box((0.16, 0.2, 3.3), (0, YF - 0.55, DZ + 2.3), TRIMN)
dr.box((3.0, 0.2, 0.16), (0, YF - 0.55, DZ + 2.8), TRIMN)
dr.box((0.2, 0.24, 0.8), (-0.4, YF - 0.62, DZ + 1.7), AMBN, bev=0.06, seg=2)
dr.box((0.2, 0.24, 0.8), (0.4, YF - 0.62, DZ + 1.7), AMBN, bev=0.06, seg=2)
cbox(dr, (8.2, 2.0, 0.6), (0, YF - 1.0, DZ + 4.3), TRIMN, bev=0.24)
cbox(dr, (8.0, 2.4, 0.5), (0, YF - 0.7, GZ), TRIMDN, base=True, bev=0.14, seg=2)                               # canopy slab
dr.box((7.4, 0.12, 0.1), (0, YF - 2.05, DZ + 4.6), GLN)                                          # neon on canopy edge
for sx in (-1, 1):
    dr.cyl(0.5, 4.3, (sx * 3.4, YF - 1.6, DZ), TRIMN, verts=12)
    cbox(dr, (1.3, 1.3, 0.4), (sx * 3.4, YF - 1.6, DZ), TRIMDN, base=True, bev=0.14, seg=2)
    cbox(dr, (1.3, 1.3, 0.4), (sx * 3.4, YF - 1.6, DZ + 3.9), TRIMDN, base=True, bev=0.14, seg=2)
    dr.cyl(0.45, 0.55, (sx * 5.6, YF - 0.8, DZ), TRIMN, verts=10, r2=0.4)                         # planter + bush
    dr.sphere(0.65, (sx * 5.6, YF - 0.8, DZ + 1.0), 'c_leaf_a', sub=2)
cbox(dr, (5.4, 0.9, 0.5), (0, YF - 2.35, 0.9), TRIMN, base=True, bev=0.1, seg=2)

# ------------------------------------------------------------------ big 3D open-book emblem (upper front)
EC = (0, YJ - 0.25, 8.8)
em = b.part('emblem', [TRIMN, NAVYN, IDN, PAGEN, GLN, AMBN, TRIMDN])
rplate(em, 9.2, 4.2, 0.5, (0, YJ - 0.15, 8.8), TRIMN, r=0.9, seg=4)
rplate(em, 8.6, 3.7, 0.3, (0, YJ - 0.42, 8.8), NAVYN, r=0.75, seg=4)
for k in (-1, 1):
    em.box((0.12, 0.12, 3.2), (k * 4.55, YJ - 0.5, 8.8), GLN) if False else None
cbox(em, (7.3, 0.6, 3.0), (0, YJ - 0.8, 8.75), IDN, bev=0.3)                                     # cover
for sgn in (-1, 1):
    cbox(em, (3.3, 0.7, 2.55), (sgn * 1.78, YJ - 1.1, 8.85), PAGEN, rot=(0, sgn * -0.06, 0), bev=0.2, seg=3)
    for j in range(4):
        em.box((2.2 - (j % 2) * 0.4, 0.14, 0.16), (sgn * (1.78 + 0.1 - (j % 2) * 0.2), YJ - 1.5, 9.5 - j * 0.58), GLN)
cbox(em, (0.35, 0.9, 2.8), (0, YJ - 1.1, 8.8), TRIMDN, bev=0.12, seg=2)                         # spine
cbox(em, (0.45, 0.2, 1.1), (1.0, YJ - 1.55, 10.15), AMBN, bev=0.08, seg=2)                      # bookmark ribbon
# frame glow
for dz in (-1, 1):
    em.box((9.0, 0.1, 0.1), (0, YJ - 0.5, 8.8 + dz * 2.2), GLN)
for dx in (-1, 1):
    em.box((0.1, 0.1, 4.0), (dx * 4.65, YJ - 0.5, 8.8), GLN)

# ------------------------------------------------------------------ props
pr = b.part('props', ['c_pole_post', 'c_lamp_glow', 'c_bench', 'c_pants', 'c_skin', 'c_hair', 'c_shirt_a', 'c_shirt_b', 'c_shirt_c', 'c_shirt_d', 'c_vest',
                      'c_bush', 'flower_pink', 'flower_yellow', TRIMN, 'c_leaf_b'])
for p in ((-9.9, -9.2), (9.9, -9.2), (-9.9, 8.8), (9.9, 8.8)):
    clamp_post(pr, (p[0], p[1], 0.9), 3.4)
cbench(pr, (-6.6, -9.45, 0.9), 0); cbench(pr, (6.6, -9.45, 0.9), 0)
for sx in (-1, 1):                                    # flower beds along the front
    cbox(pr, (3.2, 0.9, 0.5), (sx * 6.9, -8.3, GZ), 'c_bush', base=True, bev=0.25, seg=3)
    for k in range(4):
        pr.sphere(0.24, (sx * 6.9 - 1.1 + k * 0.75, -8.3 + (k % 2) * 0.25, GZ + 0.62), 'flower_pink' if k % 2 else 'flower_yellow', sub=1)
cperson(pr, (-1.9, -9.5, 0.9), pi, 'c_shirt_b'); cperson(pr, (2.0, -9.6, 0.9), pi, 'c_shirt_a'); cperson(pr, (3.6, -8.7, GZ), pi * 0.8, 'c_shirt_c', 0.9)
cperson(pr, (-4.2, -8.8, GZ), pi * 0.7, 'c_shirt_d')
tt = b.part('trees_trunk', ['c_trunk']); tl = b.part('trees_leaf', ['c_leaf_a', 'c_leaf_b', 'c_leaf_c', 'c_leaf_pink', 'flower_pink'])
for (x, y, k, s) in ((-9.9, -4.2, 0, 0.82), (9.9, -4.2, 0, 0.82), (-9.9, 1.5, 0, 0.85), (9.9, 1.5, 2, 0.85), (-9.8, 6.4, 0, 0.8), (9.8, 6.4, 0, 0.8),
                     (-4.5, 9.3, 0, 0.7), (4.5, 9.3, 0, 0.7), (-9.8, -8.3, 1, 0.7), (9.8, -8.3, 1, 0.7)):
    rtree(tt, tl, (x, y, 0.9), s, k)

# ------------------------------------------------------------------ STATES
def tint_shell(state, mat):
    t = b.sp(state, 'building_tint', [mat])
    cbox(t, (16.3, 5.9, LT - ZB + 0.15), (0, -4.2, ZB - 0.05), mat, base=True, bev=0.3)
    cbox(t, (16.2, 8.8, UT - ZB + 0.15), (0, 2.75, ZB - 0.05), mat, base=True, bev=0.3)
    return t

def lawn_ring(state, mat, name='ring', y_front=-9.55, hw=10.2):
    r = b.sp(state, name, [mat], origin=(0, 0, 1.0))
    r.box((2 * hw, 0.3, 0.12), (0, y_front, 0.95), mat, base=True)
    r.box((2 * hw, 0.3, 0.12), (0, -y_front + 0.2, 0.95), mat, base=True)
    for sx in (-1, 1):
        r.box((0.3, 2 * (-y_front) + 0.5, 0.12), (sx * hw, 0.1, 0.95), mat, base=True)
    return r

# ---- NORMAL: library running, cyan ring + soft glow
nb = b.sp('normal', 'beacon', [GLW], origin=(0, 3.8, UT + 0.8 + 3.0))
nb.uvsphere(0.5, (0, 3.8, UT + 0.8 + 2.95), GLW, scale=(1, 1, 1.1), u=12, v=8)
lawn_ring('normal', GLW)
nr = b.sp('normal', 'emblem_ring', [GLW], origin=EC)
for dz in (-1, 1):
    nr.box((9.4, 0.14, 0.16), (0, YJ - 0.62, 8.8 + dz * 2.35), GLW)
for dx in (-1, 1):
    nr.box((0.16, 0.14, 4.7), (dx * 4.75, YJ - 0.62, 8.8), GLW)
nl = b.sp('normal', 'book_sparkles', [GLW, AMBN])
for (x, z, k) in ((-3.6, 11.8, 0.3), (3.8, 12.2, 0.24), (2.4, 12.8, 0.18), (-2.2, 12.6, 0.2)):
    nl.prism([(0, .5), (.12, .12), (.5, 0), (.12, -.12), (0, -.5), (-.12, -.12), (-.5, 0), (-.12, .12)], 0.12, (x, YJ - 1.2, z), GLW, scale=k * 2.5)

# ---- WARNING: content needs updating -> amber, ! sign, CAN CAP NHAT board
wi = b.sp('warning', 'warn_sign', ['state_warning', 'hazard_black', 'steel_dark'], origin=(5.4, YJ - 0.2, UT + 3.3))
wi.push((5.4, YJ - 0.3, UT + 0.6), (0, 0, 0))
for dx in (-0.8, 0.8):
    wi.cyl(0.18, 1.3, (dx, 0, 0), 'steel_dark', verts=6)
wi.prism([(0, 1.6), (1.7, -1.3), (-1.7, -1.3)], 0.5, (0, 0, 2.9), 'state_warning', scale=1.25)
wi.prism([(0, 1.25), (1.35, -1.0), (-1.35, -1.0)], 0.3, (0, -0.2, 2.8), 'hazard_black', scale=1.1) if False else None
wi.box((0.5, 0.2, 1.4), (0, -0.4, 2.95), 'hazard_black', bev=0.12, seg=2)
wi.sphere(0.3, (0, -0.4, 1.9), 'hazard_black', sub=1)
wi.pop()
csiren(b, 'warning', 'beacon', (-6.6, YJ + 0.2, UT + 0.6), 0.75, 'state_warning')
lawn_ring('warning', 'state_warning')
wt = b.sp('warning', 'book_tint', [TINT_W], origin=EC)
cbox(wt, (7.5, 0.1, 3.2), (0, YJ - 1.55, 8.75), TINT_W, bev=0.1, seg=2)
ab = b.sp('warning', 'update_board', ['hazard_yellow', 'hazard_black', 'steel_dark', 'state_warning'])
ab.push((-4.6, -9.6, 0.9), (0, 0, 0.35))
cbox(ab, (2.8, 0.4, 2.6), (0, 0, 1.4), 'hazard_yellow', bev=0.2, seg=3, rot=(0.1, 0, 0))
cbox(ab, (2.3, 0.1, 2.1), (0, -0.26, 1.4), 'hazard_black', bev=0.08, seg=2, rot=(0.1, 0, 0))
ab.text('CẦN CẬP NHẬT', 0.34, (0, -0.4, 1.75), 'state_warning', depth=0.05, rot=(pi / 2 - 0.1, 0, 0))
icon_warn(ab, (0, -0.4, 1.05), 0.7, 'state_warning', 'hazard_black')
for dx in (-1.0, 1.0):
    ab.box((0.14, 0.14, 0.6), (dx, 0.12, 0.0), 'steel_dark', base=True)
ab.pop()
window_tints(b, 'warning', 'state_warning', REC)

# ---- INCIDENT: unauthorised access -> red X, caution barrier, locked library
ix = b.sp('incident', 'x_emblem', ['hazard_black', 'state_incident'], origin=EC)
cbox(ix, (7.6, 0.2, 3.2), (0, YJ - 1.6, 8.75), 'hazard_black', bev=0.25, seg=3)
for a in (0.6, -0.6):
    cbox(ix, (4.6, 0.4, 0.85), (0, YJ - 1.85, 8.75), 'state_incident', rot=(0, a, 0), bev=0.2, seg=3)
icb_l = csiren(b, 'incident', 'beacon_L', (-6.6, YJ + 0.2, UT + 0.6), 0.85, 'state_incident')
icb_r = csiren(b, 'incident', 'beacon_R', (6.6, YJ + 0.2, UT + 0.6), 0.85, 'state_incident')
caution_barrier(b, 'incident', 'barrier', [(-7.0, -9.6), (-3.0, -10.0), (3.0, -10.0), (7.0, -9.6)], 0.9, 1.9)
def lock_icon(mb, p):
    x, y, z = p
    mb.box((1.6, 0.3, 1.2), (x, y - 0.05, z - 0.5), 'state_incident', bev=0.18, seg=3)
    mb.ring(0.55, 0.32, 0.3, (x, y - 0.05, z + 0.3), 'state_incident', rot=(pi / 2, 0, 0), seg=14, arc=pi, a0=0)
    mb.box((0.28, 0.32, 0.28), (x, y - 0.2, z - 0.5), 'hazard_black', bev=0.05, seg=1)
float_sign(b, 'incident', 'lock_sign', (-9.0, -7.6, GZ), 4.2, 3.6, 'hazard_black', lock_icon, 'screen_dark', rz=0.45)
lawn_ring('incident', 'state_incident')
ig = b.sp('incident', 'door_lock', ['state_incident', 'hazard_black', 'hazard_yellow'])
hazard_bar(ig, (-2.0, YF - 0.7), (2.0, YF - 0.7), DZ + 3.9, 0.55, 0.2, 7)
hazard_bar(ig, (-2.0, YF - 0.7), (2.0, YF - 0.7), DZ + 0.9, 0.55, 0.2, 7)
window_tints(b, 'incident', 'state_incident', REC)
tint_shell('incident', TINT_I)

# ---- RECOVERY: moderation + restore -> blue-grey shield + progress
sh = b.sp('recovery', 'shield', ['state_recovery', 'steel_dark', 'white', NAVYN], origin=EC)
cbox(sh, (7.6, 0.2, 3.2), (0, YJ - 1.6, 8.75), NAVYN, bev=0.25, seg=3)
sh.prism(SHIELD, 0.6, (0, YJ - 1.95, 8.75), 'state_recovery', scale=3.1)
sh.prism(SHIELD, 0.3, (0, YJ - 2.3, 8.75), 'steel_dark', scale=2.4)
ccheck(sh, (0, YJ - 2.55, 8.75), 2.2, 'white', 0.3)
dm = b.sp('recovery', 'shield_dome', [DOME])
hemisphere(dm, 15.5, (0, 0, 0.9), DOME, scale=(1.0, 0.9, 0.8), u=32, v=16)
lawn_ring('recovery', 'state_recovery', 'ring')
progress_bar(b, 'recovery', 'progress', (0, -10.3, 1.35), 8.0, 0.9, 0.6, 'steel_dark', 'state_recovery', 0.9, 0.0)
rb = csiren(b, 'recovery', 'beacon', (-6.6, YJ + 0.2, UT + 0.6), 0.75, 'state_recovery')
window_tints(b, 'recovery', 'state_recovery', REC)
tint_shell('recovery', TINT_R)

total = b.finish()
bpy.context.view_layer.update()
print(CODE, 'tris', total, 'objs', len(b.coll.objects))
if PREVIEW:
    cpreview(CODE, 5.0, 40, cy=-0.5, extra=(('detail', -30, 28, 24, 6.0, 'normal'), ('back', 150, 32, 40, 5.0, 'normal'),
                                          ('detail_warning', -30, 28, 24, 6.0, 'warning'), ('detail_incident', -30, 28, 24, 6.0, 'incident'), ('detail_recovery', -30, 28, 24, 6.0, 'recovery')))
    print('preview done')
if EXPORT:
    save_blend(CODE)
    export_glb(CODE)
