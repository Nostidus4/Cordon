# B08 - Quang truong GuardianAI (D20 x 6 m). CARTOON/TOY style central hub: round raised plaza, glowing blue fountain, a GIANT
# hologram shield, 4 info boards, 4 light pillars, hedges, round trees, lamps, benches, little people.
exec(open('/Users/mac/Documents/Cordon/Blender/scripts/common.py').read(), globals())
PREVIEW = globals().get('PREVIEW', True)
CODE = 'B08'
b = Bld(CODE, 'Quảng trường GuardianAI', 'D20x6', 8.5)
cartoon_materials()

IDN, GL = 'B08_identity', 'B08_glow'
MAT(IDN, '#18A8FF', 0.55, 0.0)
MAT(GL, '#6CEEFF', 0.4, 0.0, '#00E5FF', 2.2)
MAT('B08_stone', '#DCE0F5', 0.65)
MAT('B08_stone_dark', '#9AA2CF', 0.7)
MAT('B08_navy', '#1A2E86', 0.5)
MAT('B08_water', '#2FA4FF', 0.1, 0.0, '#1E8CFF', 1.0, 0.8)
MAT('B08_hologram', '#4FD9FF', 0.15, 0.0, '#18C8FF', 1.7, 0.7)
MAT('B08_hologram_core', '#BFF4FF', 0.2, 0.0, '#9EEFFF', 2.2, 0.85)
MAT('B08_beam', '#4FD9FF', 0.1, 0.0, '#18C8FF', 1.0, 0.22)
MAT('B08_screen', '#0A2C6A', 0.3, 0.0, '#0E3F94', 0.9)
SIGNM = MAT('B08_board', '#1E3FA8', 0.55)
HOL, BEAM, WAT = 'B08_hologram', 'B08_beam', 'B08_water'
ZP = 1.05                                     # plaza platform level (top of paving)
def polar(r, a): return (r * cos(a), r * sin(a))

# ----------------------------------------------------------------- platform: curb disc, lawn ring, paving, walkways
base = b.part('base', ['c_curb', 'c_lawn', 'B08_stone', 'B08_stone_dark', IDN, GL, 'c_sidewalk'])
base.cyl(11.2, 0.6, (0, 0, 0), 'c_curb', verts=64, bev=0.3)
base.cyl(10.3, 0.35, (0, 0, 0.6), 'c_sidewalk', verts=64, bev=0.1)
base.cyl(9.6, 0.3, (0, 0, 0.8), 'c_lawn', verts=64, bev=0.1)
base.cyl(7.6, 0.3, (0, 0, 0.8), 'B08_stone', verts=64, bev=0.1)                 # inner paved circle (top ZP)
base.ring(7.7, 7.45, 0.12, (0, 0, ZP), GL, seg=64)                              # neon seam
for a in (0, pi / 2, pi, 3 * pi / 2):                                            # 4 walkways through the lawn
    x, y = polar(8.8, a)
    base.box((4.0, 3.4, 0.28), (x, y, 0.8), 'B08_stone', rot=(0, 0, a), base=True, bev=0.1)
    x2, y2 = polar(10.3, a)
# fountain: chunky basin with glowing rim, pedestal, upper bowl
base.ring(5.2, 4.2, 1.1, (0, 0, ZP), IDN, seg=64)
base.ring(5.6, 5.2, 0.5, (0, 0, ZP), 'B08_stone', seg=64)
base.ring(4.35, 4.2, 0.1, (0, 0, ZP + 1.15), GL, seg=64)
base.cyl(4.2, 0.4, (0, 0, ZP), 'B08_navy', verts=64)
base.cyl(2.2, 1.9, (0, 0, ZP + 0.3), IDN, verts=32, r2=1.7, bev=0.15)             # pedestal
base.cyl(3.1, 0.8, (0, 0, ZP + 2.0), IDN, verts=48, r2=2.0, bev=0.1)              # upper bowl
base.ring(3.1, 2.9, 0.12, (0, 0, ZP + 2.75), GL, seg=48)
base.cyl(1.0, 0.7, (0, 0, ZP + 2.8), 'B08_stone', verts=20, r2=0.8)

# ----------------------------------------------------------------- pillars + boards (chunky)
pil = b.part('pillars', [IDN, GL, 'B08_stone_dark', 'B08_stone'])
for a in (pi / 4, 3 * pi / 4, 5 * pi / 4, 7 * pi / 4):
    x, y = polar(6.3, a)
    pil.push((x, y, ZP), (0, 0, a - pi / 2))
    cbox(pil, (1.5, 1.5, 0.5), (0, 0, 0), 'B08_stone', base=True, bev=0.15)
    cbox(pil, (1.1, 1.1, 2.8), (0, 0, 0.5), IDN, base=True, bev=0.25)
    cbox(pil, (1.4, 1.4, 0.3), (0, 0, 3.3), 'B08_stone', base=True, bev=0.1)
    pil.sphere(0.5, (0, 0, 3.9), GL, sub=2)
    pil.pop()
brd = b.part('boards', [SIGNM, 'B08_screen', 'c_pole_post', IDN])
for a in (0.0, pi / 2, pi, 3 * pi / 2):
    x, y = polar(7.0, a + pi / 4)
    brd.push((x, y, ZP), (0, 0, a + pi / 4 - pi / 2))
    for sx in (-1, 1):
        cbox(brd, (0.35, 0.35, 1.7), (sx * 2.0, 0, 0), 'c_pole_post', base=True, bev=0.1, seg=2)
    brd.box((5.0, 0.45, 2.6), (0, 0, 2.5), SIGNM, bev=0.25, seg=3)
    brd.box((4.4, 0.2, 2.1), (0, -0.25, 2.5), 'B08_screen')
    brd.pop()

# ----------------------------------------------------------------- hedges / lamps / benches / trees / people
pr = b.part('props', ['c_pole_post', 'c_lamp_glow', 'c_bench', 'c_bush', 'flower_pink', 'flower_yellow', 'c_pants', 'c_skin', 'c_hair', 'c_shirt_a', 'c_shirt_b', 'c_shirt_c', 'c_shirt_d', 'c_vest'])
tt = b.part('trees_trunk', ['c_trunk']); tl = b.part('trees_leaf', ['c_leaf_a', 'c_leaf_b', 'c_leaf_c', 'c_leaf_pink', 'flower_pink'])
Z_LAWN = 1.1
for k in range(16):                                                   # hedge balls on the lawn ring (skip walkway gaps)
    a = k * pi / 8 + pi / 16
    if any(abs(((a - c + pi) % (2 * pi)) - pi) < 0.2 for c in (0, pi / 2, pi, 3 * pi / 2)):
        continue
    x, y = polar(9.2, a)
    pr.sphere(1.05, (x, y, Z_LAWN + 0.5), 'c_bush', sub=2, scale=(1, 1, 0.85))
    pr.sphere(0.22, (x * 0.96, y * 0.96, Z_LAWN + 1.5), 'flower_pink' if k % 2 else 'flower_yellow', sub=1)
for k in range(8):
    a = k * pi / 4 + pi / 8
    x, y = polar(10.0, a); clamp_post(pr, (x, y, 0.95), 3.8)
    bx, by = polar(8.0, a + pi / 8); cbench(pr, (bx, by, ZP), a + pi / 8 + pi / 2 + pi)
    tx, ty = polar(8.9, a - pi / 8 * 0)
for (a, s_, kd) in ((pi / 8 + 0.1, 1.2, 2), (3 * pi / 8, 1.3, 0), (5 * pi / 8 + 0.1, 1.2, 2), (7 * pi / 8, 1.3, 0), (9 * pi / 8, 1.2, 2), (11 * pi / 8, 1.3, 0), (13 * pi / 8, 1.2, 2), (15 * pi / 8, 1.3, 0)):
    x, y = polar(9.9, a)
    rtree(tt, tl, (x, y, Z_LAWN), s_ * 0.62, kd)
for (r, a, c, v) in ((6.6, 0.3, 'c_shirt_a', False), (7.1, 1.9, 'c_shirt_b', False), (6.7, 3.4, 'c_shirt_c', False), (6.4, 4.6, 'c_shirt_d', True), (7.2, 5.6, 'c_shirt_b', False), (6.5, 2.6, 'c_shirt_a', False)):
    x, y = polar(r, a); cperson(pr, (x, y, ZP), a + 2.0, c, vest=v)

# ================================================================= STATES
# --- normal : water + giant cyan hologram shield + public dashboards
wj = b.sp('normal', 'water', [WAT], origin=(0, 0, ZP + 0.6))
wj.cyl(4.2, 0.12, (0, 0, ZP + 0.75), WAT, verts=64)
wj.cyl(2.9, 0.12, (0, 0, ZP + 2.8), WAT, verts=48)
wj.cyl(0.55, 3.0, (0, 0, ZP + 2.9), WAT, verts=12, r2=0.1, smooth=True)
for k in range(10):
    a = k * 2 * pi / 10
    for r_, z_ in ((1.2, ZP + 4.9), (1.9, ZP + 4.4), (2.5, ZP + 3.6)):
        x, y = polar(r_, a + (0.3 if r_ == 1.9 else 0))
        wj.sphere(0.17, (x, y, z_), WAT, sub=1)
for k in range(20):
    a = k * 2 * pi / 20; x, y = polar(3.0, a)
    wj.box((0.14, 0.14, 1.4), (x, y, ZP + 1.9), WAT)
HZ = ZP + 7.0
sh = b.sp('normal', 'hologram_shield', [HOL, 'B08_hologram_core'], origin=(0, 0, HZ))
icon_shield(sh, (0, 0, HZ), 5.0, HOL, None, 0.5)
sh.prism([(0, .26), (.07, .08), (.24, .06), (.1, -.04), (.14, -.24), (0, -.12), (-.14, -.24), (-.1, -.04), (-.24, .06), (-.07, .08)], 0.6, (0, 0, HZ), 'B08_hologram_core', scale=5.0)   # star
bm_ = b.sp('normal', 'hologram_beam', [BEAM], origin=(0, 0, ZP + 3.4))
bm_.cyl(1.4, 2.6, (0, 0, ZP + 3.4), BEAM, verts=24, r2=0.5)
for i, (rr, zz) in enumerate(((2.8, ZP + 3.4), (2.2, ZP + 3.9), (1.6, ZP + 4.4))):
    glow_ring(b, 'normal', f'pulse_ring_{i + 1}', (0, 0, zz), rr, rr - 0.14, HOL, 0.1, 48)
dsh = b.sp('normal', 'dashboard_screens', ['B08_glow', 'B08_hologram', 'state_ok'])
for k in range(4):
    a = k * pi / 2 + pi / 4; x, y = polar(7.0, a)
    dsh.push((x, y, ZP), (0, 0, a - pi / 2))
    dsh.text(('THÀNH PHỐ', 'GIAO DỊCH', 'SỰ KIỆN', 'CỘNG ĐỒNG')[k], 0.42, (0, -0.35, 3.1), 'B08_glow', depth=0.06)
    dsh.text(('BÌNH THƯỜNG', '1.248/giờ', '3 mới', '+12.480')[k], 0.52, (0, -0.35, 2.4), 'state_ok', depth=0.06)
    dsh.pop()
pilg = b.sp('normal', 'pillar_lights', ['B08_glow'])
for a in (pi / 4, 3 * pi / 4, 5 * pi / 4, 7 * pi / 4):
    x, y = polar(6.3, a); pilg.sphere(0.58, (x, y, ZP + 3.9), 'B08_glow', sub=1)

# --- warning : city-wide risk notice
glow_ring(b, 'warning', 'warning_ring', (0, 0, ZP + 0.2), 8.6, 8.1, 'state_warning', 0.22, 96)
glow_ring(b, 'warning', 'warning_ring_inner', (0, 0, ZP + 0.2), 6.1, 5.9, 'state_warning', 0.16, 96)
sw = b.sp('warning', 'hologram_shield', ['state_warning', 'hazard_black'], origin=(0, 0, HZ))
icon_shield(sw, (0, 0, HZ), 5.0, 'state_warning', None, 0.5)
icon_warn(sw, (0, -0.4, HZ - 0.1), 2.6, 'hazard_black', 'state_warning', th=0.5)
nb = b.sp('warning', 'priority_board', [SIGNM, 'state_warning', 'screen_dark'])
panel(nb, (0, 4.0, 11.4), 9.0, 3.2, 'state_warning')
nb.text('CẢNH BÁO RỦI RO TOÀN THÀNH PHỐ', 0.38, (0, 3.8, 12.0), 'state_warning', depth=0.06)
nb.text('Thời tiết xấu - sự cố hạ tầng', 0.32, (0, 3.8, 11.2), 'state_warning', depth=0.05)
nb.text('Ưu tiên: kiểm tra giao dịch', 0.32, (0, 3.8, 10.6), 'state_warning', depth=0.05)
for k in range(4):
    a = k * pi / 2 + pi / 4; x, y = polar(7.0, a)
    ib = b.sp('warning', f'board_alert_{k + 1}', ['state_warning', 'hazard_black'], origin=(x, y, ZP + 3.0))
    ib.push((x, y, ZP), (0, 0, a - pi / 2)); icon_warn(ib, (0, -0.4, 2.5), 1.7, 'state_warning'); ib.pop()
pw = b.sp('warning', 'pillar_lights', ['state_warning'])
for a in (pi / 4, 3 * pi / 4, 5 * pi / 4, 7 * pi / 4):
    x, y = polar(6.3, a); pw.sphere(0.65, (x, y, ZP + 3.9), 'state_warning', sub=1)
glow_ring(b, 'warning', 'pulse_ring', (0, 0, ZP + 4.2), 2.8, 2.65, 'state_warning', 0.1, 48)

# --- incident : command mode
glow_ring(b, 'incident', 'alert_ring', (0, 0, ZP + 0.2), 8.6, 8.1, 'state_incident', 0.22, 96)
glow_ring(b, 'incident', 'alert_ring_inner', (0, 0, ZP + 0.2), 6.1, 5.9, 'state_incident', 0.16, 96)
si = b.sp('incident', 'hologram_shield', ['state_incident', 'hazard_black'], origin=(0, 0, HZ))
icon_shield(si, (0, 0, HZ), 5.0, 'state_incident', None, 0.5)
icon_x(si, (0, -0.4, HZ), 3.0, 'hazard_black', 0.5)
im = b.sp('incident', 'impact_map', ['state_incident', 'B08_screen', 'B08_glow'], origin=(0, 0, ZP + 3.6))
im.cyl(3.0, 0.14, (0, 0, ZP + 3.6), 'B08_screen', verts=48)
im.ring(3.05, 2.85, 0.16, (0, 0, ZP + 3.7), 'state_incident', seg=48)
for k in range(7):
    a = radians(90 + k * 360 / 7); x, y = polar(2.0, a)
    im.box((0.5, 0.5, 0.35 + (k % 3) * 0.2), (x, y, ZP + 3.7), 'state_incident' if k in (0, 2, 3) else 'B08_glow', base=True, bev=0.08)
for k in (0, 2, 3):
    a = radians(90 + k * 360 / 7); x, y = polar(2.0, a)
    im.ring(0.95, 0.85, 0.08, (x, y, ZP + 3.8), 'state_incident', seg=24)
ec = b.sp('incident', 'emergency_cluster', ['state_incident', 'hazard_yellow', 'hazard_black', 'c_pole_post', 'white', 'c_vest', 'c_pants', 'c_skin', 'c_hair'])
for a in (radians(22), radians(112), radians(202), radians(292)):
    x, y = polar(8.3, a)
    ec.push((x, y, ZP), (0, 0, a - pi / 2))
    cbox(ec, (2.0, 1.2, 1.4), (0, 0, 0), 'white', base=True, bev=0.2)
    ec.box((1.2, 1.25, 0.26), (0, 0, 0.7), 'state_incident'); ec.box((0.26, 1.25, 1.2), (0, 0, 0.4), 'state_incident')
    ec.pop()
    px, py = polar(7.4, a + 0.2); cperson(ec, (px, py, ZP), a + pi, 'c_vest', vest=True)
for a in (0.0, pi / 2, pi, 3 * pi / 2):
    ec.push((0, 0, 0), (0, 0, a + pi / 2))
    for sx in (-1, 1): cbox(ec, (0.35, 0.35, 1.6), (sx * 2.5, -10.9, 0.0), 'c_pole_post', base=True, bev=0.08, seg=2)
    hazard_bar(ec, (-2.5, -10.9), (2.5, -10.9), 1.2, 0.55, 0.28, 6)
    ec.pop()
for k, a in enumerate((radians(45), radians(135), radians(225), radians(315))):
    x, y = polar(9.2, a); beacon(b, 'incident', f'siren_{k + 1}', (x, y, 0.95), 0.6, 'state_incident')
bi = b.sp('incident', 'command_board', [SIGNM, 'state_incident', 'screen_dark'])
panel(bi, (0, 4.0, 11.4), 9.0, 3.2, 'state_incident')
bi.text('CHẾ ĐỘ CHỈ HUY SỰ CỐ', 0.52, (0, 3.8, 11.9), 'state_incident', depth=0.06)
bi.text('Cụm hỗ trợ khẩn cấp đang điều phối', 0.33, (0, 3.8, 11.0), 'state_incident', depth=0.05)

# --- recovery : coordination screen + progress
sr = b.sp('recovery', 'hologram_shield', ['state_recovery', 'white'], origin=(0, 0, HZ))
icon_shield(sr, (0, 0, HZ), 5.0, 'state_recovery', None, 0.5)
icon_check(sr, (0, -0.4, HZ), 3.4, 'white', 0.45)
glow_ring(b, 'recovery', 'safe_ring', (0, 0, ZP + 0.2), 8.6, 8.1, 'state_recovery', 0.22, 96)
pr_ = b.sp('recovery', 'progress_ring', ['state_recovery'], origin=(0, 0, ZP + 0.2))
pr_.ring(9.6, 9.2, 0.3, (0, 0, ZP + 0.2), 'state_recovery', seg=96, arc=2 * pi * 0.87, a0=pi / 2)
sc_ = b.sp('recovery', 'status_screen', [SIGNM, 'state_recovery', 'screen_dark'])
panel(sc_, (0, 4.0, 11.4), 9.6, 3.8, 'state_recovery')
sc_.text('ĐIỀU PHỐI KHÔI PHỤC', 0.5, (0, 3.8, 12.3), 'state_recovery', depth=0.06)
sc_.text('87%', 1.3, (0, 3.8, 11.1), 'state_recovery', depth=0.07)
progress_bar(b, 'recovery', 'progress', (0, 3.7, 10.0), 7.6, 0.4, 0.87, 'steel_dark', 'state_recovery', 0.2)

total = b.finish()
bpy.context.view_layer.update()
print(CODE, 'tris', total, 'objs', len(b.coll.objects))
if PREVIEW:
    cartoon_preview(CODE, center=(0, 0, 5), scale=36, states=STATES)
    print('preview done')
