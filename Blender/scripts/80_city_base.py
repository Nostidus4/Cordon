# 80_city_base.py - CARTOON city base v2 (premium diorama, NO PEOPLE): raised island + rock-bordered water + pier/boats/lily pads, street grid with
# crosswalks/stop lines/traffic lights, plaza ring (planters, flags), gate arch + bridge, empty fenced assembly lawn (sign + arrows),
# 12 small parks (paths, mounds, flower beds, benches, bollards), clustered foliage in 3 greens + cherry + pines, street furniture,
# bus stops, food cart, bikes, parked/moving cars.  Night contract: lamp* / window* / carlight* / *_glow materials are emissive.
exec(open('/Users/mac/Documents/Cordon/Blender/scripts/common_env.py').read(), globals())
sc = bpy.context.scene
shared_materials(); env_materials()
for o in list(bpy.data.objects):
    if o.name.startswith('city_'):
        bpy.data.objects.remove(o, do_unlink=True)
city = bpy.data.collections.get('city') or bpy.data.collections.new('city')
if city.name not in [c.name for c in sc.collection.children]:
    sc.collection.children.link(city)
base_coll = bpy.data.collections.get('city_base') or bpy.data.collections.new('city_base')
if base_coll.name not in [c.name for c in city.children]:
    city.children.link(base_coll)
class CityB:
    def __init__(s): s.coll = base_coll; s.open = []
cb = CityB()
def mk(name, mats=()): return MB(cb, name, None, list(mats))
CMAT('city_paver', '#B2ACD8'); CMAT('city_curb', '#D7D3EC'); CMAT('city_wall', '#5B5C99'); CMAT('city_asphalt', '#4A4E7A')
CMAT('city_line', '#F4F1FF'); CMAT('city_yellow', '#F6C945'); CMAT('city_green_glow', '#35E08A', '#2EE68A', 2.4)
CMAT('city_water_m', '#4F78D6', '#6C92EC', 0.25, 0.12); CMAT('city_foam', '#9DB8FF', '#8FAEFF', 0.35, 0.3)
CMAT('city_banner', '#2B5BE0'); CMAT('city_fence', '#F2F0FF'); CMAT('city_signgreen', '#1E9A58'); CMAT('city_warm', '#FFD27A', '#FFAE4D', 3.0)
CMAT('tire', '#1B1D2E'); CMAT('car_a', '#E8503A'); CMAT('car_b', '#3C82F6'); CMAT('car_c', '#F6C945')

X0, X1, Y0, Y1 = -66.0, 66.0, -64.0, 52.0
CX, CY = (X0 + X1) / 2, (Y0 + Y1) / 2
W, D = X1 - X0, Y1 - Y0
WATER_Z = -2.6
rng = random.Random(7)

# ------------------------------------------------------------ ground: island + curb + water
g = mk('city_ground', ['city_paver', 'city_curb', 'city_wall', 'city_foam'])
g.box((W, D, 3.0), (CX, CY, -3.0), 'city_wall', bev=0.8, seg=3)
g.box((W, D, 0.2), (CX, CY, -0.2), 'city_paver', bev=0.15, seg=2)
curb_w, curb_h = 2.5, 0.9
g.box((W, curb_w, curb_h), (CX, Y1 - curb_w / 2, 0), 'city_curb', base=True, bev=0.4)
g.box((W, curb_w, curb_h), (CX, Y0 + curb_w / 2, 0), 'city_curb', base=True, bev=0.4)
g.box((curb_w, D - 2 * curb_w + 0.4, curb_h), (X0 + curb_w / 2, CY, 0), 'city_curb', base=True, bev=0.4)
g.box((curb_w, D - 2 * curb_w + 0.4, curb_h), (X1 - curb_w / 2, CY, 0), 'city_curb', base=True, bev=0.4)
w = mk('city_water', ['city_water_m', 'city_foam'])
w.box((420, 420, 1.0), (0, 0, -3.6), 'city_water_m')

# ------------------------------------------------------------ streets
st = mk('city_streets', ['city_asphalt', 'city_curb', 'city_line', 'city_yellow'])
SW = 5.6
def street(x0, y0, x1, y1):
    cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
    L = abs(x1 - x0) if abs(x1 - x0) > abs(y1 - y0) else abs(y1 - y0)
    horiz = abs(x1 - x0) > abs(y1 - y0)
    size = (L, SW, 0.08) if horiz else (SW, L, 0.08)
    st.box(size, (cx, cy, 0.0), 'city_asphalt', base=True, bev=0.02, seg=1)
    for sgn in (-1, 1):
        if horiz: st.box((L, 0.45, 0.2), (cx, cy + sgn * (SW / 2 + 0.2), 0.0), 'city_curb', base=True, bev=0.1, seg=2)
        else: st.box((0.45, L, 0.2), (cx + sgn * (SW / 2 + 0.2), cy, 0.0), 'city_curb', base=True, bev=0.1, seg=2)
    n = int(L // 4.0)
    for i in range(n):
        t = -L / 2 + 2.0 + i * 4.0
        if horiz: st.box((2.0, 0.18, 0.02), (cx + t, cy, 0.08), 'city_line')
        else: st.box((0.18, 2.0, 0.02), (cx, cy + t, 0.08), 'city_line')
STREETS = [(-60, 11, 60, 11), (-60, -18, 60, -18), (-44, -47, 44, -47),
           (0, -50, 0, -10), (0, 11, 0, 21), (-59.5, -43, -59.5, 11), (59.5, -43, 59.5, 11)]
for s_ in STREETS: street(*s_)
st.ring(15.6, 11.3, 0.08, (0, 0, 0.04), 'city_asphalt', seg=96)
st.ring(11.8, 11.65, 0.04, (0, 0, 0.1), 'city_line', seg=96)
def crosswalk(x, y, horiz):
    for i in range(7):
        o = (i - 3) * 0.75
        if horiz: st.box((0.45, 4.8, 0.03), (x + o, y, 0.08), 'city_line')
        else: st.box((4.8, 0.45, 0.03), (x, y + o, 0.08), 'city_line')
XW = [(0, 18, False), (0, -16.5, False), (-6, 11, True), (6, 11, True), (-6, -18, True), (6, -18, True), (0, -46, False), (-14, 11, True), (14, 11, True),
      (-59.5, 4, True), (59.5, 4, True), (-59.5, -12, True), (59.5, -12, True), (-59.5, -24, True), (59.5, -24, True)]
for (x, y, hz) in XW: crosswalk(x, y, hz)
# stop lines at the four plaza approaches + main intersections
for (x, y, hz, sg) in ((-1.4, 19.8, False, 1), (1.4, 16.2, False, 1), (-1.4, -13.2, False, 1), (1.4, -19.8, False, 1)):
    st.box((2.7, 0.3, 0.03), (x, y, 0.08), 'city_line')

# ------------------------------------------------------------ gate arch + bridge
gt = mk('city_gate', ['city_curb', 'city_banner', 'city_warm', 'white', 'city_wall', 'B08_hologram', 'city_asphalt', 'city_line', 'c_pole_post'])
GY = -56.0
gt.push((0, GY, 0))
for sx in (-1, 1):
    x = sx * 10.5
    cbox(gt, (5.6, 5.6, 1.4), (x, 0, 0), 'city_wall', base=True, bev=0.4)
    cbox(gt, (5.0, 5.0, 14.0), (x, 0, 1.4), 'city_curb', base=True, bev=0.5)
    cbox(gt, (6.0, 6.0, 1.0), (x, 0, 15.4), 'city_curb', base=True, bev=0.4)
    gt.box((3.6, 0.5, 8.0), (x, -2.7, 6.0), 'city_banner', bev=0.2, seg=2)
    icon_shield(gt, (x, -3.2, 8.5), 3.0, 'white', 'city_banner', 0.3)
    gt.prism([(-1.8, 0), (1.8, 0), (1.8, -0.2), (0, -1.2), (-1.8, -0.2)], 0.3, (x, -3.0, 2.1), 'white')
    cbox(gt, (1.4, 0.4, 2.4), (x, -2.65, 1.4), 'city_warm', base=True, bev=0.2)
gt.ring(7.6, 4.9, 4.6, (0, 0, 8.4), 'city_curb', rot=(pi / 2, 0, 0), seg=40, arc=pi)
gt.ring(8.0, 7.4, 4.9, (0, 0, 8.4), 'city_wall', rot=(pi / 2, 0, 0), seg=40, arc=pi)
icon_shield(gt, (0, -2.6, 13.3), 3.2, 'white', 'city_banner', 0.5)
gt.sphere(0.8, (0, -2.6, 16.5), 'city_warm', sub=2)
gt.pop()
br = mk('city_bridge', ['city_asphalt', 'city_curb', 'city_line', 'c_pole_post', 'c_lamp_glow'])
br.box((SW + 1.6, 30.0, 0.5), (0, -79.0, -0.45), 'city_curb', bev=0.15, seg=2)
br.box((SW, 30.0, 0.08), (0, -79.0, 0.0), 'city_asphalt')
for i in range(7):
    br.box((0.18, 2.0, 0.02), (0, -66.0 - i * 4.0, 0.08), 'city_line')
for sx in (-1, 1):
    br.box((0.6, 30.0, 0.9), (sx * 3.7, -79.0, 0.0), 'city_curb', base=True, bev=0.2, seg=2)
    for i in range(4):
        clamp_post(br, (sx * 3.7, -68.0 - i * 8.0, 0.9), 3.0)

# ------------------------------------------------------------ assembly area (empty fenced lawn + sign + arrows)
asm = mk('city_assembly', ['c_lawn', 'city_curb', 'city_fence', 'city_signgreen', 'white', 'city_green_glow', 'c_pole_post', 'c_bench'])
AX, AY, AW, AD = -54.0, -48.0, 14.0, 10.0
cbox(asm, (AW + 1.6, AD + 1.6, 0.4), (AX, AY, 0), 'city_curb', base=True, bev=0.25)
cbox(asm, (AW, AD, 0.3), (AX, AY, 0.4), 'c_lawn', base=True, bev=0.1, seg=2)
for sx in (-1, 1):
    asm.box((0.2, AD - 0.4, 0.2), (AX + sx * (AW / 2 - 0.3), AY, 1.5), 'city_fence'); asm.box((0.2, AD - 0.4, 0.2), (AX + sx * (AW / 2 - 0.3), AY, 0.95), 'city_fence')
for sy in (-1, 1):
    asm.box((AW - 0.4, 0.2, 0.2), (AX, AY + sy * (AD / 2 - 0.3), 1.5), 'city_fence'); asm.box((AW - 0.4, 0.2, 0.2), (AX, AY + sy * (AD / 2 - 0.3), 0.95), 'city_fence')
for sx in (-1, 0, 1):
    for sy in (-1, 1):
        asm.box((0.28, 0.28, 1.4), (AX + sx * (AW / 2 - 0.3), AY + sy * (AD / 2 - 0.3), 0.7), 'city_fence')
for dx in (-3.6, 3.6): asm.box((0.3, 0.3, 4.4), (AX + dx, AY + AD / 2 + 0.6, 0.4), 'white', base=True)
asm.push((AX, AY + AD / 2 + 0.6, 0.0))
asm.box((9.6, 0.4, 2.8), (0, 0, 5.2), 'city_signgreen', bev=0.3, seg=3)
asm.text('ĐIỂM TẬP KẾT', 1.0, (0, -0.3, 5.2), 'white', depth=0.08)
icon_shield(asm, (-4.0, -0.3, 5.2), 1.0, 'white', 'city_signgreen', 0.1)
asm.pop()
cbench(asm, (AX + 3.0, AY - AD / 2 + 1.2, 0.7), 0)
cbench(asm, (AX - 3.0, AY - AD / 2 + 1.2, 0.7), 0)
arr = mk('city_assembly_arrows', ['city_green_glow'])
for i in range(5):
    x = AX + AW / 2 + 1.8 + i * 2.6; y = AY + 1.5 + i * 1.8
    arr.push((x, y, 0.1), (0, 0, math.atan2(1.8, 2.6)))
    arr.prism([(0.9, 0), (-0.5, 1.0), (-0.1, 0), (-0.5, -1.0)], 0.08, (0, 0, 0), 'city_green_glow', rot=(pi / 2, 0, 0))
    arr.pop()

# ------------------------------------------------------------ layout helpers
PLOTS = [(-19, 21, 19, 52), (-45, 13, -23, 35), (23, 13, 45, 35), (-55, -15, -33, 7), (33, -15, 55, 7), (-41, -43, -19, -21), (19, -43, 41, -21), (AX - 8.5, AY - 6.5, AX + 8.5, AY + 10.0)]
PARKS = {   # name: (cx, cy, w, d)
    'NW': (-42, 43.5, 36, 11), 'NE': (42, 43.5, 36, 11), 'W': (-55, 26, 12, 19), 'E': (55, 26, 12, 19), 'SE': (49, -33, 11, 20),
    'SSW': (-28, -56.3, 26, 8.5), 'SSE': (28, -56.3, 26, 8.5), 'MW': (-25.5, -4, 10, 18), 'ME': (25.5, -4, 10, 18),
    'CSW': (-10.5, -32.5, 13, 21), 'CSE': (10.5, -32.5, 13, 21)}
PZ = 0.7
def in_rect(px, py, r, m=0.0): return r[0] - m < px < r[2] + m and r[1] - m < py < r[3] + m
def in_park(px, py, m=0.0):
    for (cx, cy, w_, d_) in PARKS.values():
        if abs(px - cx) < w_ / 2 + m and abs(py - cy) < d_ / 2 + m: return True
    return False
def near_street(px, py, m=5.2):
    for (x0, y0, x1, y1) in STREETS:
        if min(x0, x1) - m < px < max(x0, x1) + m and min(y0, y1) - m < py < max(y0, y1) + m: return True
    return False
def free(px, py, m=3.0):
    if math.hypot(px, py) < 19: return False
    if near_street(px, py): return False
    if abs(px) < 12 and py < -49: return False
    if px > 62: return False
    if any(in_rect(px, py, r, m) for r in PLOTS): return False
    if in_park(px, py, 2.0): return False
    return X0 + 5 < px < X1 - 5 and Y0 + 5 < py < Y1 - 5

# containers (object per category)
tt = mk('city_trees_trunk', ['c_trunk'])
tl = mk('city_trees_leaf', ['c_leaf_a', 'c_leaf_b', 'c_leaf_c', 'c_leaf_d', 'c_leaf_teal', 'c_leaf_pink', 'c_blossom_b', 'c_blossom_c', 'c_pine_a', 'c_pine_b', 'c_bush', 'c_hedge'])
fl = mk('city_flowers', ['c_soil', 'city_curb', 'fl_pink', 'fl_yellow', 'fl_white', 'fl_red', 'fl_violet', 'c_leaf_c'])
pk = mk('city_parks', ['c_curb', 'c_lawn', 'c_lawn_dark', 'c_path'])
mounds = mk('city_terrain', ['c_lawn', 'c_lawn_dark'])
lamps = mk('city_lamps', ['c_pole_post', 'c_lamp_glow'])
props = mk('city_props', ['c_bench', 'c_pole_post', 'c_bin', 'c_bin_lid', 'c_sign_white'])
veh = mk('city_vehicles', ['car_a', 'car_b', 'car_c', 'car_d', 'car_e', 'car_f', 'car_g', 'car_glass', 'tire', 'carlight_head', 'carlight_tail', 'c_lamp_glow'])
furn = mk('city_street_furniture', ['bus_blue', 'window_bus', 'tl_body', 'tl_glow_red', 'tl_glow_amber', 'tl_glow_green', 'c_curb', 'c_bench', 'c_pole_post', 'c_sign_white', 'window_cart'])
play = mk('city_park_props', ['c_playred', 'c_playblue', 'c_playyellow', 'c_gazebo', 'c_roofred', 'c_curb', 'c_pole_post', 'c_lamp_glow', 'c_bench'])
flg = mk('city_flags', ['flag_blue', 'flag_pink', 'flag_gold', 'flag_green', 'c_sign_white', 'c_lamp_glow'])
rocks = mk('city_rocks', ['c_rock_a', 'c_rock_b', 'c_rock_c'])
wd = mk('city_water_detail', ['c_pad', 'fl_pink', 'c_plank', 'c_plank_dark', 'boat_red', 'boat_white', 'boat_in', 'boat_sail', 'boat_sail2', 'flag_gold', 'c_pole_post', 'c_lamp_glow'])
pond = mk('city_pond', ['c_water_pond', 'c_curb'])

def tree_any(x, y, z, s, kind=None):
    kind = kind or rng.choices(['round', 'cherry', 'pine'], [0.46, 0.24, 0.30])[0]
    if kind == 'round': t_round(tt, tl, x, y, z, s, rng)
    elif kind == 'cherry': t_cherry(tt, tl, x, y, z, s, rng)
    else: t_pine(tt, tl, x, y, z, s, rng)

# ------------------------------------------------------------ parks
def park(name, cx, cy, w, d):
    horiz = w >= d
    pk.box((w, d, 0.5), (cx, cy, 0), 'c_curb', base=True, bev=0.35, seg=3)
    pk.box((w - 1.2, d - 1.2, 0.2), (cx, cy, 0.5), 'c_lawn', base=True, bev=0.1, seg=2)
    # sinuous path along the long axis
    L = (w if horiz else d) - 3.0
    n = int(L / 2.2)
    amp = (d if horiz else w) * 0.16
    ph = rng.uniform(0, 6.28); pts = []
    for i in range(n + 1):
        t = -L / 2 + i * L / n
        o = amp * sin(t * 0.32 + ph)
        pts.append((cx + t, cy + o) if horiz else (cx + o, cy + t))
    for i in range(n):
        (ax_, ay_), (bx_, by_) = pts[i], pts[i + 1]
        ang = math.atan2(by_ - ay_, bx_ - ax_)
        pk.box((2.7, 2.0, 0.07), ((ax_ + bx_) / 2, (ay_ + by_) / 2, PZ - 0.02), 'c_path', rot=(0, 0, ang), bev=0.03, seg=1)
    def dpath(px, py): return min(math.hypot(px - a, py - b_) for a, b_ in pts)
    def inside(px, py, m): return abs(px - cx) < w / 2 - m and abs(py - cy) < d / 2 - m
    # raised mounds (hills) away from the path
    mz = []
    for k in range(1 if min(w, d) < 12 else 2):
        for _ in range(40):
            px, py = cx + rng.uniform(-w / 2 + 3, w / 2 - 3), cy + rng.uniform(-d / 2 + 3, d / 2 - 3)
            if dpath(px, py) > 3.6 and all(math.hypot(px - a, py - b_) > 6 for a, b_, _r in mz):
                r_ = rng.uniform(2.4, 3.4) if min(w, d) >= 12 else 2.2
                mound(mounds, px, py, r_, rng.uniform(0.9, 1.4), PZ - 0.25, 'c_lawn_dark' if rng.random() < 0.4 else 'c_lawn')
                mz.append((px, py, r_)); break
    # trees: poisson with spacing, mounds carry a tree on top
    placed = []
    for (px, py, r_) in mz:
        tree_any(px, py, PZ + 1.0, rng.uniform(0.75, 0.95)); placed.append((px, py))
    target = max(3, int(w * d / 55))
    for _ in range(300):
        if len(placed) >= target + len(mz): break
        px, py = cx + rng.uniform(-w / 2 + 1.8, w / 2 - 1.8), cy + rng.uniform(-d / 2 + 1.8, d / 2 - 1.8)
        if dpath(px, py) < 2.8 or any(math.hypot(px - a, py - b_) < 4.6 for a, b_ in placed): continue
        placed.append((px, py)); tree_any(px, py, PZ, rng.uniform(0.82, 1.12))
    # bushes + flowers along the rim, hedge sections
    for _ in range(max(4, int((w + d) / 5))):
        for _t in range(20):
            px, py = cx + rng.uniform(-w / 2 + 1.1, w / 2 - 1.1), cy + rng.uniform(-d / 2 + 1.1, d / 2 - 1.1)
            edge = min(w / 2 - abs(px - cx), d / 2 - abs(py - cy))
            if edge < 2.0 and dpath(px, py) > 2.3:
                bush(tl, px, py, PZ, rng.uniform(0.8, 1.2), rng, flowers=rng.choice([0, 0, 4, 6])); break
    # flower beds + benches + bollards + bin
    for k in range(2 if w * d > 150 else 1):
        for _t in range(30):
            px, py = cx + rng.uniform(-w / 2 + 2.5, w / 2 - 2.5), cy + rng.uniform(-d / 2 + 2.5, d / 2 - 2.5)
            if dpath(px, py) > 2.9 and all(math.hypot(px - a, py - b_) > 3.2 for a, b_ in placed):
                flowerbed(fl, px, py, PZ, rng.choice([2.6, 3.4]), rng.choice([1.6, 2.2]), rng, rng.choice([('fl_pink', 'fl_yellow', 'fl_white'), ('fl_red', 'fl_yellow', 'fl_orange'), ('fl_violet', 'fl_pink', 'fl_white')]))
                placed.append((px, py)); break
    for i in (n // 4, (3 * n) // 4):
        (ax_, ay_), (bx_, by_) = pts[i], pts[i + 1]
        ang = math.atan2(by_ - ay_, bx_ - ax_)
        nx_, ny_ = -sin(ang), cos(ang)
        cbench(props, (ax_ + nx_ * 1.9, ay_ + ny_ * 1.9, PZ - 0.0), ang)   # seat faces the path
    for i in range(1, n, 3):
        (ax_, ay_) = pts[i]
        o_ = 1.7 if i % 2 else -1.7
        bollard(lamps, ax_, ay_ + o_, PZ) if horiz else bollard(lamps, ax_ + o_, ay_, PZ)
    (ax_, ay_) = pts[n // 2]
    clamp_post(lamps, (ax_ + (2.0 if horiz else 2.0), ay_ + (2.0 if horiz else 0.0), PZ), 3.4)
    bin_(props, pts[1][0] + 1.6, pts[1][1] + 1.6, PZ)
    for _ in range(int(w * d / 40)):
        px, py = cx + rng.uniform(-w / 2 + 1, w / 2 - 1), cy + rng.uniform(-d / 2 + 1, d / 2 - 1)
        if dpath(px, py) > 1.6: tuft(tl, px, py, PZ, rng, rng.uniform(0.8, 1.3))
    return pts, placed, dpath

park_data = {}
for nm, (cx, cy, w_, d_) in PARKS.items():
    park_data[nm] = park(nm, cx, cy, w_, d_)

# park specific attractions
# NW: pond with lily pads + rocks
(px, py) = (-52, 43.5)
pond.cyl(4.2, 0.35, (px, py, PZ - 0.2), 'c_curb', verts=24)
pond.cyl(3.7, 0.4, (px, py, PZ - 0.18), 'c_water_pond', verts=24)
for k in range(9):
    a = rng.uniform(0, 6.28); r = rng.uniform(0.4, 3.0)
    lily_pad(wd, px + r * cos(a), py + r * sin(a), PZ + 0.24, rng, flower=(k % 3 == 0))
for k in range(9):
    a = k * 0.7 + rng.uniform(-0.2, 0.2); rock(rocks, px + 4.4 * cos(a), py + 4.4 * sin(a), PZ + 0.1, rng.uniform(0.35, 0.6), rng)
# NE: gazebo ; E: playground ; W: picnic ; SE: picnic + bikes
gazebo(play, 42, 43.5, PZ)
swing_set(play, 55, 31, PZ, 0.0); slide(play, 55, 21, PZ, pi / 2)
picnic(play, -55, 21, PZ, pi / 2); picnic(play, -55, 30, PZ, pi / 2)
picnic(play, 49, -28, PZ, 0.0)
for k, (x, y) in enumerate(((46.5, -38), (47.6, -38), (48.7, -38))): bike(props, x, y, PZ, pi / 2, ['bike_a', 'bike_b', 'bike_c'][k])
# south parks: extra flower gardens
for (cx, cy) in ((-28, -56.3), (28, -56.3)):
    for dx in (-8, 0, 8):
        flowerbed(fl, cx + dx, cy - 1.8, PZ, 4.2, 1.8, rng, rng.choice([('fl_pink', 'fl_yellow', 'fl_white'), ('fl_red', 'fl_orange', 'fl_yellow'), ('fl_violet', 'fl_pink', 'fl_white')]))
# pocket parks beside the plaza: circular flower rings
for (cx, cy) in ((-25.5, -4), (25.5, -4)):
    for k in range(10):
        a = k * 0.628; fl.sphere(0.4, (cx + 2.4 * cos(a), cy + 2.4 * sin(a), PZ + 0.5), ['fl_pink', 'fl_yellow', 'fl_red'][k % 3], sub=0)

# ------------------------------------------------------------ street trees, lamps, benches along sidewalks
for (x0, y0, x1, y1) in STREETS:
    horiz = abs(x1 - x0) > abs(y1 - y0)
    L = abs(x1 - x0) if horiz else abs(y1 - y0)
    n = int(L // 14)
    for i in range(n):
        t = -L / 2 + 7 + i * 14 + (3 if i % 2 else 0)
        for sgn in (-1, 1):
            if (i + (sgn > 0)) % 2: continue
            px, py = ((x0 + x1) / 2 + t, (y0 + y1) / 2 + sgn * (SW / 2 + 1.0)) if horiz else ((x0 + x1) / 2 + sgn * (SW / 2 + 1.0), (y0 + y1) / 2 + t)
            if math.hypot(px, py) < 17: continue
            clamp_post(lamps, (px, py, 0.2), 3.4)
            # planter / bin alternating at the lamp
            qx, qy = (px + 2.2, py) if horiz else (px, py + 2.2)
            if i % 3 == 0: bin_(props, qx, qy, 0.2)
for k in range(12):
    a = radians(k * 30 + 15); clamp_post(lamps, (16.6 * cos(a), 16.6 * sin(a), 0.2), 3.4)
    b_ = radians(k * 30)
# plaza ring: planters + flags
PLANTERS = []
for k in range(12):
    b_ = radians(k * 30)
    x, y = 18.6 * cos(b_), 18.6 * sin(b_)
    if (abs(x) < 4.2 and abs(y) > 9) or (abs(y) < 4.2 and abs(x) > 9): continue
    PLANTERS.append((x, y, b_))
for (x, y, b_) in PLANTERS:
    planter(furn, fl, x, y, 0.2, rng, 2.6)
for k in range(8):
    a = radians(k * 45 + 22.5)
    flag(flg, 21.5 * cos(a), 21.5 * sin(a), 0.2, ['flag_blue', 'flag_pink', 'flag_gold', 'flag_green'][k % 4], 6.0, a)
for sx in (-1, 1):
    flag(flg, sx * 16.5, GY + 5.5, 0.2, 'flag_blue', 7.5, 0)
    flag(flg, sx * 16.5, GY - 5.5, 0.2, 'flag_gold', 7.5, 0)
# benches around the plaza + streets
for (x, y, rz) in ((-20, 4, pi / 2), (20, -4, -pi / 2), (-8, -22, 0), (8, -22, pi), (-24, 15.5, 0), (24, 15.5, 0), (-9, 17, 0), (9, -21.5, pi)):
    cbench(props, (x, y, 0.0), rz)
# bus stops, traffic lights, food cart, bikes
bus_stop(furn, -27, 7.6, 0.2, 0.0); bus_stop(furn, 27, -14.8, 0.2, pi)
for (ix, iy) in ((0, 11), (0, -18), (59.5, 11), (-59.5, 11), (59.5, -18), (-59.5, -18)):
    sx = -1 if ix > 0 else 1
    traffic_light(furn, ix + 3.9 * sx, iy + 3.9, 0.2, 0.0)
    traffic_light(furn, ix - 3.9 * sx, iy - 3.9, 0.2, pi)
food_cart(furn, 20.5, 8.0, 0.2, 0.0)
for k, m_ in enumerate(('bike_a', 'bike_b', 'bike_c')): bike(props, -19.3, 5.4 + k * 1.1, 0.2, 0.0, m_)
for k, m_ in enumerate(('bike_c', 'bike_a')): bike(props, 22.0, -7.5 - k * 1.1, 0.2, 0.0, m_)
# cars: moving (lane centres) + parked at the curb
for (x, y, rz, m, kind) in ((-30, 12.4, 0, 'car_a', 'sedan'), (22, 9.6, pi, 'car_b', 'hatch'), (-12, -16.6, pi, 'car_c', 'taxi'), (40, -19.4, 0, 'car_d', 'sedan'),
                            (1.4, -34, pi / 2, 'car_f', 'van'), (-1.4, -26, -pi / 2, 'car_e', 'hatch'), (57.9, -10, pi / 2, 'car_c', 'sedan'), (1.4, 16.5, pi / 2, 'car_g', 'hatch'),
                            (-40, -16.6, pi, 'car_b', 'van')):
    car(veh, x, y, rz, m, kind)
for (x, y, rz, m, kind) in ((-48, 12.9, 0, 'car_d', 'hatch'), (50, 9.1, 0, 'car_a', 'sedan'), (-48, -16.2, 0, 'car_e', 'sedan'), (50, -19.8, 0, 'car_f', 'hatch'),
                            (-22, -48.8, 0, 'car_g', 'sedan'), (18, -45.2, 0, 'car_b', 'van'), (30, -48.8, 0, 'car_c', 'hatch'), (57.7, -30, pi / 2, 'car_e', 'sedan'),
                            (-57.7, -5, pi / 2, 'car_f', 'hatch'), (-57.7, -30, pi / 2, 'car_d', 'van'), (3.6, 15.5, pi / 2, 'car_b', 'sedan')):
    car(veh, x, y, rz, m, kind)

# ------------------------------------------------------------ background foliage clusters on leftover land (on lawn pads)
pads = mk('city_lawn_pads', ['c_lawn', 'c_lawn_dark'])
centers = []
for _ in range(400):
    if len(centers) >= 14: break
    px, py = rng.uniform(X0 + 6, X1 - 6), rng.uniform(Y0 + 6, Y1 - 6)
    if not free(px, py, 4.0) or any(math.hypot(px - a, py - b_) < 11 for a, b_ in centers): continue
    centers.append((px, py))
for (cx, cy) in centers:
    pads.cyl(rng.uniform(5.2, 6.6), 0.35, (cx, cy, 0), 'c_lawn' if rng.random() < 0.7 else 'c_lawn_dark', verts=20, bev=0.0, r2=rng.uniform(4.8, 6.0), smooth=True)
    k = rng.choice([4, 5, 6]); placed = []
    for _ in range(40):
        if len(placed) >= k: break
        a = rng.uniform(0, 6.28); r = abs(rng.gauss(0, 2.3))
        px, py = cx + r * cos(a), cy + r * sin(a)
        if any(math.hypot(px - u, py - v) < 3.6 for u, v in placed): continue
        placed.append((px, py)); tree_any(px, py, 0.3, rng.uniform(0.8, 1.2))
    for _ in range(4):
        a = rng.uniform(0, 6.28); r = rng.uniform(3.2, 4.4); bush(tl, cx + r * cos(a), cy + r * sin(a), 0.3, rng.uniform(0.8, 1.1), rng, flowers=rng.choice([0, 5]))
    for _ in range(5):
        a = rng.uniform(0, 6.28); r = rng.uniform(0.5, 4.5); tuft(tl, cx + r * cos(a), cy + r * sin(a), 0.3, rng)
CLUSTERS = centers

# ------------------------------------------------------------ water edge: rocks, pier, boats, lily pads
PIER_Y = -10.0
def near_access(px, py): return (abs(px) < 6 and py < -60) or (abs(py - PIER_Y) < 4 and px > 60)
def rim_points(step):
    pts = []
    for sx in (X0, X1):
        y = Y0
        while y < Y1: pts.append((sx, y)); y += step
    for sy in (Y0, Y1):
        x = X0
        while x < X1: pts.append((x, sy)); x += step
    return pts
for (rx, ry) in rim_points(3.0):
    jx, jy = rng.uniform(-0.8, 0.8), rng.uniform(-0.8, 0.8)
    out = (-1 if rx == X0 else 1 if rx == X1 else 0, -1 if ry == Y0 else 1 if ry == Y1 else 0)
    px, py = rx + out[0] * 0.9 + (jx if out[0] == 0 else 0.0), ry + out[1] * 0.9 + (jy if out[1] == 0 else 0.0)
    if near_access(px, py): continue
    rock(rocks, px + (jx * 0.5 if out[0] else 0), py + (jy * 0.5 if out[1] else 0), WATER_Z + rng.uniform(0.0, 0.5), rng.uniform(0.9, 1.7), rng)
    if rng.random() < 0.35:
        rock(rocks, px + out[0] * rng.uniform(1.4, 2.4), py + out[1] * rng.uniform(1.4, 2.4), WATER_Z + 0.1, rng.uniform(0.5, 0.9), rng)
# pier on the east side
PX0, PX1 = 64.0, 83.0
wd.box((PX1 - PX0, 3.6, 0.28), ((PX0 + PX1) / 2, PIER_Y, -0.35), 'c_plank', bev=0.06, seg=1)
for i in range(int((PX1 - PX0) / 1.0)):
    wd.box((0.08, 3.6, 0.03), (PX0 + 0.5 + i, PIER_Y, -0.2), 'c_plank_dark')
for i in range(5):
    for sy in (-1, 1):
        wd.cyl(0.28, 3.0, (PX0 + 1.5 + i * 4.2, PIER_Y + sy * 1.6, -3.3), 'c_plank_dark', verts=7)
for sy in (-1, 1):
    wd.box((PX1 - PX0 - 2, 0.12, 0.12), ((PX0 + PX1) / 2 - 1, PIER_Y + sy * 1.65, 0.7), 'c_plank_dark', bev=0.03, seg=1)
    for i in range(6):
        wd.box((0.15, 0.15, 1.0), (PX0 + 1.5 + i * 3.3, PIER_Y + sy * 1.65, -0.2), 'c_plank_dark')
clamp_post(wd, (PX1 - 0.6, PIER_Y + 1.5, -0.2), 3.2)
clamp_post(wd, (PX0 + 4.0, PIER_Y - 1.5, -0.2), 3.2)
boat(wd, 74.0, PIER_Y + 4.0, WATER_Z + 0.05, 0.05, 'row')
boat(wd, 90.0, PIER_Y - 10.0, WATER_Z + 0.05, 0.5, 'sail')
boat(wd, -84.0, 8.0, WATER_Z + 0.05, 1.2, 'sail')
boat(wd, -20.0, -75.0, WATER_Z + 0.05, 0.3, 'row')
for (cx, cy, rr) in ((-74, -30, 5), (-72, 36, 4.5), (76, 30, 5), (-30, -71, 4.5), (34, -73, 4.5), (73, -38, 4)):
    for k in range(9):
        a = rng.uniform(0, 6.28); r = rng.uniform(0.3, rr)
        lily_pad(wd, cx + r * cos(a), cy + r * sin(a), WATER_Z + 0.0, rng, flower=(k % 4 == 0))

for m_ in cb.open: m_.done()
names = [(o.name, tris(o)) for o in base_coll.objects]
print('city base:', names, 'tris', sum(tris(o) for o in base_coll.objects))
