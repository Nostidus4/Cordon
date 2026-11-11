# common_env.py - environment kit for the city base: foliage, terrain, water props, street furniture, vehicles. No people.
# exec after common.py.  All builders take an MB (or two for trees: trunk MB + leaf MB).
exec(open('/Users/mac/Documents/Cordon/Blender/scripts/common.py').read(), globals())

def env_materials():
    cartoon_materials()
    for n, c in (('c_leaf_d', '#8AD65A'), ('c_leaf_teal', '#2F9E6F'), ('c_pine_a', '#2A8658'), ('c_pine_b', '#1F6E4C'),
                 ('c_blossom_b', '#FFB8DA'), ('c_blossom_c', '#EC80BC'), ('c_hedge', '#3A9A48'), ('c_soil', '#6B4A3A'),
                 ('c_rock_a', '#9894BE'), ('c_rock_b', '#B0ACD2'), ('c_rock_c', '#77739F'), ('c_plank', '#C98E5B'), ('c_plank_dark', '#8A5B3A'),
                 ('c_pad', '#4FBF6A'), ('c_bin', '#3C8F7A'), ('c_bin_lid', '#2A6E5C'), ('bus_blue', '#3C82F6'), ('c_path', '#D6D0F0'),
                 ('boat_red', '#E8503A'), ('boat_white', '#F4F1FF'), ('boat_in', '#B3774A'), ('boat_sail', '#FFF1C7'), ('boat_sail2', '#FF8FC0'),
                 ('car_d', '#9B6BFF'), ('car_e', '#F4F1FF'), ('car_f', '#35C9B5'), ('car_g', '#FF9A3C'), ('car_dark', '#2C2A52'),
                 ('bike_a', '#FF6F61'), ('bike_b', '#35C9B5'), ('bike_c', '#F6C945'),
                 ('cart_body', '#FFB347'), ('cart_awn_r', '#E8503A'), ('cart_awn_w', '#F7F4FF'), ('cart_dark', '#4A3A5C'),
                 ('flag_blue', '#2B5BE0'), ('flag_pink', '#FF6FB5'), ('flag_gold', '#FFC94A'), ('flag_green', '#35C98A'),
                 ('fl_red', '#FF5C6C'), ('fl_yellow', '#FFD84A'), ('fl_white', '#FFFFFF'), ('fl_violet', '#B58CFF'), ('fl_orange', '#FF9A3C'),
                 ('c_sign_white', '#F4F1FF'), ('c_playred', '#E8503A'), ('c_playblue', '#3C82F6'), ('c_playyellow', '#F6C945'),
                 ('c_roofred', '#D8505A'), ('c_gazebo', '#F4F1FF'), ('tl_body', '#2C2A52')):
        CMAT(n, c)
    CMAT('fl_pink', '#FF6FB5')
    CMAT('city_foam', '#FFFFFF', '#DFF9FF', 0.4, 0.4, alpha=0.62)
    CMAT('c_sand', '#F0DCB0'); CMAT('house_a', '#F8E7D6'); CMAT('house_b', '#FFD3DF'); CMAT('house_c', '#D5E6FF'); CMAT('c_roofteal', '#3FA7A0')
    CMAT('window_house', '#FFE2A0', '#FFC264', 1.0, 0.3)
    CMAT('beacon_red', '#E8503A')
    CMAT('car_glass', '#CFE6FF', rough=0.15)                                   # NOT emissive (night uses carlight / window)
    CMAT('carlight_head', '#FFF6D0', '#FFF0B0', 3.0, 0.3)
    CMAT('carlight_tail', '#FF3040', '#FF2030', 3.0, 0.3)
    CMAT('window_bus', '#BFE6FF', '#9FD0FF', 1.0, 0.3)                          # lit bus-stop panel (window* contract)
    CMAT('window_cart', '#FFE7A8', '#FFC96B', 1.0, 0.3)
    CMAT('tl_glow_red', '#FF3040', '#FF2030', 3.0, 0.3); CMAT('tl_glow_amber', '#FFC030', '#FFB020', 3.0, 0.3); CMAT('tl_glow_green', '#35E08A', '#2EE68A', 3.0, 0.3)
    CMAT('c_lamp_glow', '#FFE08A', '#FFC95A', 3.0)
    CMAT('c_water_pond', '#5B8FE8', '#5B8FE8', 0.2, 0.15)

TREE_TONES = [('c_leaf_a', 'c_leaf_b', 'c_leaf_d'), ('c_leaf_c', 'c_leaf_a', 'c_leaf_teal'), ('c_leaf_b', 'c_leaf_d', 'c_leaf_a')]

def t_round(tt, tl, x, y, z, s, rng, tone=None):
    tone = tone or rng.choice(TREE_TONES)
    tt.cyl(0.36 * s, 2.0 * s, (x, y, z), 'c_trunk', r2=0.25 * s, verts=8, smooth=True)
    tl.sphere(1.8 * s, (x, y, z + 3.2 * s), tone[0], sub=2, scale=(1, 1, 0.92))
    for k in range(3):
        a = rng.uniform(0, 6.28) + k * 2.1; r = rng.uniform(0.8, 1.25) * s
        tl.sphere(rng.uniform(0.95, 1.25) * s, (x + r * cos(a), y + r * sin(a), z + (3.5 + 0.7 * k * rng.random()) * s), tone[1 + (k % 2)], sub=1)

def t_cherry(tt, tl, x, y, z, s, rng):
    tt.cyl(0.34 * s, 2.0 * s, (x, y, z), 'c_trunk', r2=0.24 * s, verts=8, smooth=True)
    tone = ('c_leaf_pink', 'c_blossom_b', 'c_blossom_c')
    tl.sphere(1.95 * s, (x, y, z + 3.1 * s), tone[0], sub=2, scale=(1, 1, 0.85))
    for k in range(4):
        a = rng.uniform(0, 6.28) + k * 1.6; r = rng.uniform(0.9, 1.5) * s
        tl.sphere(rng.uniform(0.8, 1.1) * s, (x + r * cos(a), y + r * sin(a), z + (3.2 + 0.5 * rng.random()) * s), tone[1 + (k % 2)], sub=1)

def t_pine(tt, tl, x, y, z, s, rng):
    tt.cyl(0.3 * s, 1.4 * s, (x, y, z), 'c_trunk', r2=0.22 * s, verts=6)
    n = rng.choice([3, 4])
    for i in range(n):
        rr = (2.0 - i * 0.42) * s
        tl.cyl(rr, 1.7 * s, (x, y, z + (0.9 + i * 1.15) * s), 'c_pine_a' if i % 2 == 0 else 'c_pine_b', r2=0.1 * s, verts=9, smooth=True)

def bush(tl, x, y, z, s, rng, flowers=0):
    tone = rng.choice(['c_bush', 'c_leaf_a', 'c_leaf_c', 'c_leaf_b'])
    tl.sphere(0.95 * s, (x, y, z + 0.55 * s), tone, sub=1, scale=(1, 1, 0.82))
    a = rng.uniform(0, 6.28)
    tl.sphere(0.7 * s, (x + 0.75 * s * cos(a), y + 0.75 * s * sin(a), z + 0.45 * s), tone, sub=1, scale=(1, 1, 0.8))
    for k in range(flowers):
        b = rng.uniform(0, 6.28); r = rng.uniform(0.3, 0.9) * s
        tl.sphere(0.17 * s, (x + r * cos(b), y + r * sin(b), z + (0.95 + 0.2 * rng.random()) * s), rng.choice(['fl_pink', 'fl_yellow', 'fl_white', 'fl_red']), sub=0)

def hedge(tl, x, y, z, L, rz=0.0, h=1.0):
    tl.box((L, 1.1, h), (x, y, z), 'c_hedge', rot=(0, 0, rz), bev=0.35, seg=2, base=True)

def flowerbed(mb, x, y, z, w, d, rng, cols=('fl_pink', 'fl_yellow', 'fl_white')):
    mb.box((w, d, 0.3), (x, y, z), 'c_soil', base=True, bev=0.1, seg=1)
    for sy in (-1, 1): mb.box((w + 0.3, 0.22, 0.45), (x, y + sy * (d / 2), z), 'c_curb', base=True, bev=0.07, seg=1)
    for sx in (-1, 1): mb.box((0.22, d + 0.3, 0.45), (x + sx * (w / 2), y, z), 'c_curb', base=True, bev=0.07, seg=1)
    nx, ny = max(2, int(w / 0.85)), max(2, int(d / 0.85))
    for i in range(nx):
        for j in range(ny):
            px = x - w / 2 + (i + 0.5) * w / nx + rng.uniform(-0.12, 0.12); py = y - d / 2 + (j + 0.5) * d / ny + rng.uniform(-0.12, 0.12)
            mb.sphere(0.34, (px, py, z + 0.55), rng.choice(cols), sub=0, scale=(1, 1, 0.85))
            if rng.random() < 0.5: mb.sphere(0.24, (px + 0.2, py, z + 0.35), 'c_leaf_c', sub=0)

def tuft(tl, x, y, z, rng, s=1.0):
    for k in range(4):
        a = rng.uniform(0, 6.28); r = rng.uniform(0.0, 0.25) * s
        tl.cyl(0.13 * s, rng.uniform(0.45, 0.8) * s, (x + r * cos(a), y + r * sin(a), z), 'c_leaf_d', r2=0.01, verts=4, rot=(rng.uniform(-0.3, 0.3), rng.uniform(-0.3, 0.3), 0))

def rock(mb, x, y, z, r, rng):
    mb.sphere(r, (x, y, z), rng.choice(['c_rock_a', 'c_rock_b', 'c_rock_c']), sub=1, smooth=False,
              scale=(rng.uniform(0.9, 1.5), rng.uniform(0.8, 1.2), rng.uniform(0.55, 0.9)))

def mound(mb, x, y, r, h, z0, m='c_lawn'):
    """raised grass hill: squashed uv-sphere, flat base sunk into the ground."""
    mb.uvsphere(r, (x, y, z0), m, scale=(1, 1, h / r), u=18, v=8)

def bin_(mb, x, y, z, m='c_bin'):
    mb.cyl(0.42, 0.95, (x, y, z), m, verts=10, r2=0.5)
    mb.cyl(0.54, 0.16, (x, y, z + 0.95), 'c_bin_lid', verts=10)

def planter(mb, ml, x, y, z, rng, L=2.4):
    mb.box((L, 1.1, 0.7), (x, y, z), 'c_curb', base=True, bev=0.2, seg=2)
    ml.box((L - 0.3, 0.8, 0.3), (x, y, z + 0.6), 'c_soil', base=True, bev=0.05, seg=1)
    for i in range(int(L / 0.7)):
        ml.sphere(0.42, (x - L / 2 + 0.5 + i * 0.7, y + rng.uniform(-0.15, 0.15), z + 1.05), rng.choice(['fl_pink', 'fl_yellow', 'fl_red', 'fl_violet', 'c_bush']), sub=1)

def flag(mb, x, y, z, m, h=6.5, rz=0.0):
    mb.cyl(0.14, h, (x, y, z), 'c_sign_white', verts=6)
    mb.sphere(0.24, (x, y, z + h + 0.1), 'c_lamp_glow', sub=1)
    mb.push((x, y, z + h - 0.9), (0, 0, rz))
    mb.prism([(0, 0.55), (2.3, 0.35), (2.0, 0.0), (2.3, -0.35), (0, -0.55)], 0.1, (0.1, 0, 0), m)
    mb.pop()

def bike(mb, x, y, z, rz, m):
    mb.push((x, y, z), (0, 0, rz))
    for dx in (-0.55, 0.55):
        mb.ring(0.42, 0.34, 0.1, (dx, 0, 0.42), 'tire', rot=(pi / 2, 0, 0), seg=12)
    mb.box((1.1, 0.07, 0.07), (0, 0, 0.62), m, rot=(0, 0.25, 0))
    mb.box((0.07, 0.07, 0.55), (-0.1, 0, 0.62), m, rot=(0, -0.15, 0))
    mb.box((0.07, 0.07, 0.55), (0.5, 0, 0.7), m, rot=(0, 0.2, 0))
    mb.box((0.35, 0.16, 0.07), (-0.15, 0, 0.98), 'c_pole_post')
    mb.box((0.07, 0.6, 0.07), (0.6, 0, 1.0), 'c_pole_post')
    mb.pop()

def car(mb, x, y, rz, m, kind='sedan', z=0.08, lights=True):
    mb.push((x, y, z), (0, 0, rz))
    if kind == 'van':
        mb.box((4.6, 2.2, 1.2), (0, 0, 0.5), m, bev=0.35, seg=2)
        mb.box((3.4, 2.05, 0.95), (-0.5, 0, 1.55), 'car_glass', bev=0.3, seg=2)
        mb.box((3.5, 2.15, 0.25), (-0.5, 0, 2.45), m, bev=0.1, seg=1)
    elif kind == 'hatch':
        mb.box((3.6, 2.1, 1.0), (0, 0, 0.5), m, bev=0.35, seg=2)
        mb.box((2.3, 1.95, 0.85), (-0.2, 0, 1.45), 'car_glass', bev=0.3, seg=2)
        mb.box((2.4, 2.05, 0.2), (-0.2, 0, 2.28), m, bev=0.08, seg=1)
    else:
        mb.box((4.6, 2.2, 1.0), (0, 0, 0.5), m, bev=0.35, seg=2)
        mb.box((2.5, 2.0, 0.85), (-0.3, 0, 1.45), 'car_glass', bev=0.3, seg=2)
        mb.box((2.6, 2.1, 0.2), (-0.3, 0, 2.28), m, bev=0.08, seg=1)
        if kind == 'taxi': mb.box((0.9, 0.5, 0.35), (-0.3, 0, 2.55), 'c_lamp_glow', bev=0.1, seg=1)
    L = 2.3 if kind in ('sedan', 'van', 'taxi') else 1.85
    for dx in (-L * 0.65, L * 0.65):
        for dy in (-1.1, 1.1):
            mb.cyl(0.45, 0.35, (dx, dy, 0.45), 'tire', rot=(pi / 2, 0, 0), verts=10, base=False)
    if lights:
        for dy in (-0.7, 0.7):
            mb.box((0.12, 0.45, 0.28), (L + 0.0, dy, 0.82), 'carlight_head', bev=0.04, seg=1)
            mb.box((0.12, 0.45, 0.28), (-L - 0.0, dy, 0.82), 'carlight_tail', bev=0.04, seg=1)
    mb.pop()

def bus_stop(mb, x, y, z, rz):
    mb.push((x, y, z), (0, 0, rz))
    mb.box((4.4, 0.25, 0.25), (0, 0, 0.0), 'c_curb', base=True)
    for dx in (-2.0, 2.0): mb.cyl(0.14, 2.9, (dx, 0.7, 0.0), 'bus_blue', verts=6)
    mb.box((4.8, 1.9, 0.28), (0, 0.3, 2.9), 'bus_blue', bev=0.12, seg=2)
    mb.box((4.0, 0.12, 2.1), (0, 1.15, 0.65), 'window_bus', bev=0.02, seg=1)
    mb.box((1.8, 0.55, 0.15), (0, 0.5, 0.5), 'c_bench', bev=0.04, seg=1)
    mb.cyl(0.1, 3.6, (2.9, 0.4, 0.0), 'c_pole_post', verts=6)
    mb.cyl(0.55, 0.12, (2.9, 0.3, 3.5), 'bus_blue', rot=(pi / 2, 0, 0), verts=14, base=False)
    mb.cyl(0.34, 0.14, (2.9, 0.22, 3.5), 'c_sign_white', rot=(pi / 2, 0, 0), verts=14, base=False)
    mb.pop()

def traffic_light(mb, x, y, z, rz=0.0):
    mb.push((x, y, z), (0, 0, rz))
    mb.cyl(0.14, 4.2, (0, 0, 0), 'tl_body', verts=6)
    mb.box((0.62, 0.55, 1.5), (0, 0, 4.0), 'tl_body', bev=0.1, seg=1)
    for i, m in enumerate(('tl_glow_red', 'tl_glow_amber', 'tl_glow_green')):
        mb.sphere(0.16, (0, -0.28, 4.55 - i * 0.45), m, sub=1)
    mb.pop()

def food_cart(mb, x, y, z, rz):
    mb.push((x, y, z), (0, 0, rz))
    mb.box((2.6, 1.5, 1.1), (0, 0, 0.55), 'cart_body', bev=0.2, seg=2, base=True)
    mb.box((2.8, 1.6, 0.18), (0, 0, 1.6), 'cart_dark', bev=0.05, seg=1)
    mb.box((2.0, 0.1, 0.5), (0, -0.78, 1.95), 'window_cart', bev=0.02, seg=1)           # lit menu board
    for dx in (-1.3, 1.3):
        mb.cyl(0.55, 0.22, (dx, 0.9, 0.55), 'tire', rot=(pi / 2, 0, 0), verts=10, base=False)
        mb.cyl(0.55, 0.22, (dx, -0.9, 0.55), 'tire', rot=(pi / 2, 0, 0), verts=10, base=False)
    for dx in (-1.3, 1.3): mb.cyl(0.08, 2.4, (dx, -0.7, 1.0), 'cart_dark', verts=5)
    for i in range(6):                                                                   # striped awning
        mb.box((0.5, 1.7, 0.1), (-1.5 + i * 0.6, -1.15, 3.25 - 0.0), 'cart_awn_r' if i % 2 == 0 else 'cart_awn_w', rot=(0.35, 0, 0), bev=0.02, seg=1)
    mb.sphere(0.2, (1.4, 0.6, 1.9), 'c_lamp_glow', sub=1)
    mb.pop()

def swing_set(mb, x, y, z, rz):
    mb.push((x, y, z), (0, 0, rz))
    for dx in (-2.0, 2.0):
        mb.cyl(0.12, 3.4, (dx, -0.8, 0), 'c_playblue', verts=5, rot=(0.25, 0, 0))
        mb.cyl(0.12, 3.4, (dx, 0.8, 0), 'c_playblue', verts=5, rot=(-0.25, 0, 0))
    mb.cyl(0.14, 4.4, (0, 0, 3.35), 'c_playred', verts=6, rot=(0, pi / 2, 0), base=False)
    for dx in (-0.8, 0.8):
        mb.cyl(0.03, 2.4, (dx - 0.35, 0, 1.2), 'c_pole_post', verts=4); mb.cyl(0.03, 2.4, (dx + 0.35, 0, 1.2), 'c_pole_post', verts=4)
        mb.box((0.9, 0.35, 0.1), (dx, 0, 1.15), 'c_playyellow', bev=0.03, seg=1)
    mb.pop()

def slide(mb, x, y, z, rz):
    mb.push((x, y, z), (0, 0, rz))
    mb.box((1.8, 1.8, 0.2), (0, 0, 1.9), 'c_playyellow', bev=0.06, seg=1)
    for dx in (-0.8, 0.8):
        for dy in (-0.8, 0.8): mb.cyl(0.09, 1.9, (dx, dy, 0), 'c_playblue', verts=5)
    mb.box((1.2, 3.6, 0.14), (0, -2.5, 1.0), 'c_playred', rot=(0.5, 0, 0), bev=0.05, seg=1)
    mb.box((0.14, 3.6, 0.35), (-0.65, -2.5, 1.15), 'c_playred', rot=(0.5, 0, 0)); mb.box((0.14, 3.6, 0.35), (0.65, -2.5, 1.15), 'c_playred', rot=(0.5, 0, 0))
    mb.box((1.0, 0.12, 1.5), (0, 1.1, 2.9), 'c_playblue', bev=0.04, seg=1)
    mb.pop()

def gazebo(mb, x, y, z):
    mb.cyl(3.4, 0.5, (x, y, z), 'c_curb', verts=8, bev=0.0)
    for k in range(6):
        a = k * pi / 3 + pi / 6
        mb.cyl(0.16, 3.4, (x + 2.6 * cos(a), y + 2.6 * sin(a), z + 0.5), 'c_gazebo', verts=6)
    mb.cyl(3.7, 1.8, (x, y, z + 3.9), 'c_roofred', verts=6, r2=0.25)
    mb.sphere(0.3, (x, y, z + 5.8), 'c_lamp_glow', sub=1)

def picnic(mb, x, y, z, rz):
    mb.push((x, y, z), (0, 0, rz))
    mb.box((2.4, 1.0, 0.14), (0, 0, 0.95), 'c_bench', bev=0.04, seg=1)
    for sy in (-1, 1): mb.box((2.4, 0.4, 0.12), (0, sy * 0.9, 0.55), 'c_bench', bev=0.03, seg=1)
    for dx in (-0.9, 0.9): mb.box((0.12, 2.0, 0.9), (dx, 0, 0), 'c_pole_post', base=True)
    mb.pop()

def bollard(mb, x, y, z):
    mb.cyl(0.22, 0.9, (x, y, z), 'c_pole_post', verts=8, r2=0.18)
    mb.sphere(0.25, (x, y, z + 1.05), 'c_lamp_glow', sub=1)

def boat(mb, x, y, z, rz, kind='row'):
    mb.push((x, y, z), (0, 0, rz))
    hull = [(-2.0, 0.75), (2.5, 0.75), (1.7, 0.0), (-1.5, 0.0)]
    mb.prism(hull, 1.7, (0, 0, 0.0), 'boat_red' if kind == 'row' else 'boat_white')
    mb.prism([(-1.6, 0.75), (2.1, 0.75), (1.5, 0.55), (-1.2, 0.55)], 1.3, (0, 0, 0.12), 'boat_in')
    mb.box((0.3, 1.3, 0.1), (0.2, 0, 0.7), 'c_plank', bev=0.02, seg=1)
    if kind == 'row':
        mb.box((0.14, 2.2, 0.08), (-0.4, 0, 0.85), 'c_plank_dark', rot=(0, 0, 0.0))
    else:
        mb.cyl(0.1, 6.0, (0.2, 0, 0.7), 'c_plank_dark', verts=5)
        mb.prism([(0, 0), (0, 5.2), (2.4, 0.3)], 0.08, (0.35, 0.0, 1.0), 'boat_sail2')
        mb.prism([(0, 0.2), (0, 4.2), (-1.7, 0.2)], 0.08, (0.05, 0.0, 1.2), 'boat_sail')
        mb.prism([(0, 0), (0, 0.6), (0.9, 0.3)], 0.06, (0.2, 0.0, 6.5), 'flag_gold')
    mb.pop()

def lily_pad(mb, x, y, z, rng, flower=False):
    r = rng.uniform(0.45, 0.8)
    mb.cyl(r, 0.06, (x, y, z), 'c_pad', verts=10)
    if flower:
        mb.sphere(0.2, (x + 0.1, y, z + 0.18), 'fl_pink', sub=1, scale=(1, 1, 0.8))

# ---------------------------------------------------------------- iso framing (island + 8 buildings fill FILL of a 16:9 ortho frame)
HERO_AZ, HERO_EL = -35.0, 32.0
HERO_FILL = 0.92   # bbox(island+buildings) / frame width -> island rect ~80% of a 16:9 frame
def iso_axes(az=HERO_AZ, el=HERO_EL):
    a, e = radians(az), radians(el)
    d = Vector((sin(a) * cos(e), -cos(a) * cos(e), sin(e)))
    q = (-d).to_track_quat('-Z', 'Y')
    return q @ Vector((1, 0, 0)), q @ Vector((0, 1, 0)), d

def iso_frame(fill=0.75, az=HERO_AZ, el=HERO_EL):
    """returns (target, ortho_scale, (right, up, uc, vc)) so island+buildings span `fill` of the frame."""
    r, u, d = iso_axes(az, el)
    pts = [Vector((x, y, 0)) for x in (-66, 66) for y in (-64, 52)]
    for code in ['B0%d' % i for i in range(1, 9)]:
        ob = bpy.data.objects.get(code)
        if not ob: continue
        for ch in [ob] + list(ob.children_recursive):
            if ch.type == 'MESH':
                pts += [ch.matrix_world @ Vector(c) for c in ch.bound_box]
    us = [p.dot(r) for p in pts]; vs = [p.dot(u) for p in pts]
    bw, bh = max(us) - min(us), max(vs) - min(vs)
    uc, vc = (max(us) + min(us)) / 2, (max(vs) + min(vs)) / 2
    scale = max(bw / fill, bh * 16 / 9 / fill)
    return r * uc + u * vc, scale, (r, u, uc, vc)

def in_frame(p, fr, scale, margin=1.12):
    r, u, uc, vc = fr
    return abs(p.dot(r) - uc) < scale / 2 * margin and abs(p.dot(u) - vc) < scale * 9 / 32 * margin

def ribbon(mb, pts, norms, widths, z, m, closed=False, off=0.0):
    """flat strip along pts: from p+n*off to p+n*(off+width). Faces point up."""
    n = len(pts); n0 = mb._begin()
    rows = [(mb.bm.verts.new(Vector((p[0] + nn[0] * off, p[1] + nn[1] * off, z))), mb.bm.verts.new(Vector((p[0] + nn[0] * (off + w), p[1] + nn[1] * (off + w), z))))
            for p, nn, w in zip(pts, norms, widths)]
    for i in range(n if closed else n - 1):
        a, b = rows[i], rows[(i + 1) % n]
        f = mb.bm.faces.new((a[0], a[1], b[1], b[0]))
        f.normal_update()
        if f.normal.z < 0: f.normal_flip()
    mb._end(n0, m)
