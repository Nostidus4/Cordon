# 85_surroundings.py v2 - organic outer coastline (noise-displaced, coves, sand strips, varied terrain), lit promenade, far lit houses/kiosks,
# clustered forests / meadows, 3 islets (one lighthouse with `lamp` emissive top), soft wavy foam ribbons (alpha 0.5), boats, lily pads, bridge extension.
# Objects named city_surr_* (exported as city_surroundings.glb). city_water stays a plain separate mesh in city_base.
exec(open('/Users/mac/Documents/Cordon/Blender/scripts/common_env.py').read(), globals())
sc = bpy.context.scene
env_materials()
for o in list(bpy.data.objects):
    if o.name.startswith('city_surr'): bpy.data.objects.remove(o, do_unlink=True)
base_coll = bpy.data.collections.get('city_base')
class CityS:
    def __init__(s): s.coll = base_coll; s.open = []
cs = CityS()
def mks(name, mats=()): return MB(cs, 'city_surr_' + name, None, list(mats))
CMAT('city_asphalt', '#4A4E7A'); CMAT('city_line', '#F4F1FF'); CMAT('city_curb', '#D7D3EC')
rs = random.Random(2026)
WZ = -2.6
CXY = (0.0, -6.0)
tgt, scl, fr = iso_frame(HERO_FILL)
print('hero frame scale', scl)
def vis(x, y, z=2.0, m=1.12): return in_frame(Vector((x, y, z)), fr, scl, m)
def ss(t):
    t = max(0.0, min(1.0, t)); return t * t * (3 - 2 * t)
def snoise(x, y): return 0.5 * sin(x * 0.04 + 1.1) * cos(y * 0.05 + 0.3) + 0.3 * sin((x - y) * 0.09 + 2.0) + 0.2 * sin(x * 0.13) * sin(y * 0.11)

# ------------------------------------------------------------ organic coastline (polar around the island centre)
def superr(th, a, b, n=4.0):
    c, s_ = abs(cos(th)), abs(sin(th))
    return (((c / a) ** n) + ((s_ / b) ** n)) ** (-1.0 / n)
COVES = [(0.5, 0.16, 11), (2.3, 0.2, 9), (3.7, 0.14, 12), (5.3, 0.18, -7), (1.4, 0.12, -6)]
def rc(th):
    r = superr(th, 94.0, 88.0)
    r += 4.5 * sin(2 * th + 1.0) + 3.5 * sin(5 * th + 2.0) + 2.2 * sin(9 * th + 0.5)
    for (t0, wd, amp) in COVES:
        dt = (th - t0 + pi) % (2 * pi) - pi
        r += amp * math.exp(-(dt / wd) ** 2)
    return r
def ro(th): return superr(th, 215.0, 200.0)
def isl_sd(x, y):                              # distance outside the island rect (<0 inside)
    dx, dy = max(-66 - x, x - 66, 0), max(-64 - y, y - 52, 0)
    return math.hypot(dx, dy)
# enforce >=24 m channel everywhere (bridge end excluded) by pushing the coast outwards
NA = 260
TH = [2 * pi * j / NA for j in range(NA)]
RC = []
for th in TH:
    r = rc(th)
    while isl_sd(CXY[0] + r * cos(th), CXY[1] + r * sin(th)) < 24.0: r += 1.0
    RC.append(r)
RC = [(RC[j - 1] + 2 * RC[j] + RC[(j + 1) % NA]) / 4 for j in range(NA)]       # smooth
def rc_at(th):
    t = (th % (2 * pi)) / (2 * pi) * NA; j = int(t) % NA; f = t - int(t)
    return RC[j] * (1 - f) + RC[(j + 1) % NA] * f
def polar(x, y):
    dx, dy = x - CXY[0], y - CXY[1]
    return math.hypot(dx, dy), math.atan2(dy, dx)
def dcoast(x, y):
    r, th = polar(x, y); return r - rc_at(th)
def hz(x, y):
    d = dcoast(x, y)
    if d < 0: return 0.0
    h = (0.5 + 0.5 * snoise(x, y)) * 6.5 - 0.6
    z = max(0.0, h) * ss((d - 10) / 28.0) ** 1.3
    if y < -78: z *= ss((abs(x) - 6) / 14.0)
    return z
def on_land(x, y, m=1.0): return dcoast(x, y) > m
def sand_mask(th): return sin(3 * th + 0.7) + 0.6 * sin(7 * th) > 0.35

# ---- terrain mesh: cliff skirt + rings of quads with noise heights; sand strips on coves
land = mks('shore', ['c_lawn', 'c_lawn_dark', 'c_rock_c', 'c_sand', 'c_leaf_d'])
FR = [0.0, 0.012, 0.03, 0.055, 0.09, 0.14, 0.2, 0.28, 0.38, 0.5, 0.65, 0.82, 1.0]
def pt_at(j, f):
    th = TH[j]; r = RC[j] + f * (ro(th) - RC[j])
    return CXY[0] + r * cos(th), CXY[1] + r * sin(th)
bm = land.bm
rings = []
for f in FR:
    row = []
    for j in range(NA):
        x, y = pt_at(j, f); row.append(bm.verts.new(Vector((x, y, hz(x, y) + (0.0 if f > 0 else 0.0)))))
    rings.append(row)
low = [bm.verts.new(Vector((*pt_at(j, 0.0), -3.4))) for j in range(NA)]
n0 = land._begin()
for j in range(NA):
    j2 = (j + 1) % NA
    f = bm.faces.new((low[j], low[j2], rings[0][j2], rings[0][j])); f.normal_update()
    th = TH[j]
    if f.normal.dot(Vector((cos(th), sin(th), 0))) > 0: f.normal_flip()
land._end(n0, 'c_rock_c', False)
for i in range(len(FR) - 1):
    for j in range(NA):
        j2 = (j + 1) % NA
        n0 = land._begin()
        f = bm.faces.new((rings[i][j], rings[i + 1][j], rings[i + 1][j2], rings[i][j2])); f.normal_update()
        if f.normal.z < 0: f.normal_flip()
        x, y = pt_at(j, FR[i]); th = TH[j]
        if i <= 1 and sand_mask(th): m = 'c_sand'
        else: m = 'c_lawn_dark' if snoise(x * 1.7, y * 1.7) > 0.55 else 'c_lawn'
        land._end(n0, m, True)

# ------------------------------------------------------------ foam ribbons (soft organic, hugging shorelines)
foam = mks('foam', ['city_foam'])
FZ = WZ + 0.04
def nrm(pts, closed, outward_sign=1):
    out = []
    n = len(pts)
    for i in range(n):
        a = pts[(i - 1) % n] if (closed or i > 0) else pts[i]; b = pts[(i + 1) % n] if (closed or i < n - 1) else pts[i]
        tx, ty = b[0] - a[0], b[1] - a[1]; L = math.hypot(tx, ty) or 1
        out.append((ty / L * outward_sign, -tx / L * outward_sign))
    return out
def wav(i, base, var, ph): return base + var * (0.5 + 0.5 * sin(i * 0.37 + ph)) * (0.6 + 0.4 * sin(i * 0.11 + ph * 2))
# island edge: rounded rect outline
def island_outline():
    pts = []
    R = 4.0; x0, x1, y0, y1 = -66.0, 66.0, -64.0, 52.0
    step = 1.8
    for (cx, cy, a0) in ((x1 - R, y1 - R, 0), (x0 + R, y1 - R, pi / 2), (x0 + R, y0 + R, pi), (x1 - R, y0 + R, 1.5 * pi)):
        for k in range(5):
            a = a0 + (pi / 2) * k / 4; pts.append((cx + (R + 0.5) * cos(a), cy + (R + 0.5) * sin(a)))
    # insert straight samples between corners
    full = []
    for i in range(len(pts)):
        a, b = pts[i], pts[(i + 1) % len(pts)]
        d = math.hypot(b[0] - a[0], b[1] - a[1]); k = max(1, int(d / step))
        for t in range(k): full.append((a[0] + (b[0] - a[0]) * t / k, a[1] + (b[1] - a[1]) * t / k))
    return full
io = island_outline()
inn = nrm(io, True, 1)
# outward normal check (should point away from centre)
if (inn[0][0] * (io[0][0] - 0) + inn[0][1] * (io[0][1] + 6)) < 0: inn = [(-a, -b) for a, b in inn]
ribbon(foam, io, inn, [wav(i, 2.0, 2.6, 0.5) for i in range(len(io))], FZ, 'city_foam', True, off=-0.2)
# outer coast
co = [(CXY[0] + RC[j] * cos(TH[j]), CXY[1] + RC[j] * sin(TH[j])) for j in range(NA)]
cn = nrm(co, True, -1)
if (cn[0][0] * (co[0][0]) + cn[0][1] * (co[0][1] + 6)) > 0: cn = [(-a, -b) for a, b in cn]     # point towards the island (into the water)
ribbon(foam, co, cn, [wav(i, 1.8, 2.8, 1.7) for i in range(NA)], FZ, 'city_foam', True, off=-0.3)
def blob(x, y, r, wmax=1.4):
    k = 14; pts = []; ns = []
    ph = rs.uniform(0, 6)
    for i in range(k):
        a = 2 * pi * i / k; pts.append((x + r * cos(a), y + r * sin(a))); ns.append((cos(a), sin(a)))
    ribbon(foam, pts, ns, [rs.uniform(0.4, wmax) * (0.6 + 0.4 * sin(i * 1.7 + ph)) for i in range(k)], FZ, 'city_foam', True, off=-0.3)

# ------------------------------------------------------------ channel sampling helpers
used = []
def chan_pt(min_isl, min_coast, rad, tries=400, vis_only=True):
    for _ in range(tries):
        x, y = rs.uniform(-120, 120), rs.uniform(-125, 110)
        if isl_sd(x, y) < min_isl or dcoast(x, y) > -min_coast: continue
        if 60 < x < 92 and -18 < y < 2: continue
        if abs(x) < 9 and y < -60: continue
        if any(math.hypot(x - a, y - b) < rad + r2 + 3 for a, b, r2 in used): continue
        if vis_only and not vis(x, y, 0, 1.15): continue
        return x, y
    return None
rk = mks('rocks', ['c_rock_a', 'c_rock_b', 'c_rock_c'])
# island rim is handled in base; shoreline rocks on the outer coast
for j in range(0, NA, 4):
    x, y = co[j]
    if not vis(x, y, 0, 1.1) or (abs(x) < 8 and y < -80) or rs.random() < 0.35: continue
    th = TH[j]; ix, iy = -cos(th), -sin(th)
    rr = rs.uniform(0.9, 1.8); px, py = x + ix * 0.6, y + iy * 0.6
    rock(rk, px, py, WZ + rs.uniform(0.0, 0.5), rr, rs)
    if rs.random() < 0.4: blob(px, py, rr * 1.1, 1.0)
# ------------------------------------------------------------ 3 islets (one lighthouse)
isl_t = mks('islet_trunks', ['c_trunk'])
isl_l = mks('islet_leaves', ['c_leaf_a', 'c_leaf_b', 'c_leaf_c', 'c_leaf_d', 'c_leaf_teal', 'c_leaf_pink', 'c_blossom_b', 'c_blossom_c', 'c_pine_a', 'c_pine_b', 'c_bush'])
isl = mks('islets', ['c_lawn', 'c_rock_a', 'c_rock_b', 'c_rock_c', 'c_sand'])
lh = mks('lighthouse', ['boat_white', 'beacon_red', 'c_lamp_glow', 'cart_dark'])
ISL = []
for k, r in enumerate((6.0, 5.0, 4.5)):
    p = chan_pt(9, 9, r)
    if not p: p = chan_pt(9, 9, r, 2000, False)
    x, y = p; used.append((x, y, r)); ISL.append((x, y, r))
    isl.cyl(r, 0.9, (x, y, WZ - 0.2), 'c_lawn', verts=18, r2=r * 0.9)
    for i in range(10):
        a = i * 0.628 + rs.uniform(-0.25, 0.25); rock(isl, x + (r + 0.1) * cos(a), y + (r + 0.1) * sin(a), WZ + rs.uniform(0.0, 0.5), rs.uniform(0.8, 1.3), rs)
    blob(x, y, r + 0.8, 2.0)
    if k == 0:       # lighthouse
        lh.cyl(1.5, 0.8, (x, y, WZ + 0.6), 'cart_dark', verts=10)
        lh.cyl(1.35, 9.0, (x, y, WZ + 0.7), 'boat_white', verts=12, r2=0.95, smooth=True)
        for zz, rr in ((WZ + 3.2, 1.2), (WZ + 6.4, 1.03)): lh.cyl(rr, 1.4, (x, y, zz), 'beacon_red', verts=12, r2=rr - 0.12)
        lh.cyl(1.35, 0.3, (x, y, WZ + 9.7), 'cart_dark', verts=12)
        lh.cyl(0.85, 1.3, (x, y, WZ + 10.0), 'c_lamp_glow', verts=10)
        lh.cyl(1.15, 1.2, (x, y, WZ + 11.3), 'beacon_red', verts=10, r2=0.05)
        bush(isl_l, x + 2.5, y - 1.5, WZ + 0.7, 0.9, rs, flowers=4)
    else:
        (t_cherry if k == 1 else t_round)(isl_t, isl_l, x, y, WZ + 0.7, 1.0, rs)
        bush(isl_l, x - 2, y + 1.2, WZ + 0.7, 0.9, rs, flowers=5)
# surfacing rocks with soft foam blobs
for _ in range(9):
    p = chan_pt(7, 7, 1.6)
    if not p: continue
    x, y = p; rr = rs.uniform(0.9, 2.0); used.append((x, y, rr)); rock(rk, x, y, WZ + rs.uniform(0.0, 0.4), rr, rs); blob(x, y, rr * 1.1, 1.0)
# boats + lily pads
bt = mks('boats', ['boat_red', 'boat_white', 'boat_in', 'boat_sail', 'boat_sail2', 'flag_gold', 'c_plank', 'c_plank_dark'])
for kind in ('sail', 'row', 'sail'):
    p = chan_pt(8, 8, 3.2)
    if p: used.append((p[0], p[1], 3.2)); boat(bt, p[0], p[1], WZ + 0.05, rs.uniform(0, 6.2), kind)
lp = mks('lilypads', ['c_pad', 'fl_pink'])
for _ in range(7):
    p = chan_pt(6, 6, 5.0)
    if not p: continue
    used.append((p[0], p[1], 3))
    for k in range(11):
        a = rs.uniform(0, 6.28); r = rs.uniform(0.3, 4.5); lily_pad(lp, p[0] + r * cos(a), p[1] + r * sin(a), WZ, rs, flower=(k % 4 == 0))

# ------------------------------------------------------------ bridge extension to the outer shore + road + lit promenade
yc = CXY[1] + rc_at(-pi / 2) * -1.0 * -1 if False else None
r_s, _ = polar(0, CXY[1] - rc_at(-pi / 2))
YC = CXY[1] - rc_at(-pi / 2)               # y of the coast at x=0 (south)
print('south coast y', YC)
rd = mks('road', ['city_asphalt', 'city_line', 'city_curb', 'c_pole_post', 'c_lamp_glow', 'c_path'])
if YC < -94:
    L = -94 - YC + 1.5; cy = -94 - L / 2 + 0.2
    rd.box((7.2, L, 0.5), (0, cy, -0.45), 'city_curb', bev=0.15, seg=2)
    rd.box((5.6, L, 0.08), (0, cy, 0.0), 'city_asphalt')
    for sx in (-1, 1):
        rd.box((0.6, L, 0.9), (sx * 3.7, cy, 0.0), 'city_curb', base=True, bev=0.2, seg=2)
RL = 46.0
y0r = min(YC, -94) + 0.2
rd.box((5.6, RL, 0.08), (0, y0r - RL / 2, 0.02), 'city_asphalt')
for i in range(int(RL / 4.4)): rd.box((0.18, 2.0, 0.02), (0, y0r - 2 - i * 4.4, 0.1), 'city_line')
for sx in (-1, 1):
    rd.box((0.5, RL, 0.25), (sx * 3.1, y0r - RL / 2, 0.02), 'city_curb', base=True, bev=0.1, seg=1)
    for i in range(1, 5): clamp_post(rd, (sx * 4.3, y0r - i * 10.0, 0.0), 3.4)
rd.cyl(8.0, 0.1, (0, y0r - RL - 4, 0.0), 'c_path', verts=24)
for k in range(6):
    a = k * pi / 3; clamp_post(rd, (9.0 * cos(a), y0r - RL - 4 + 9.0 * sin(a), 0.0), 3.4)
# promenade ring (path ribbon) + lamps + benches
pm = mks('promenade', ['c_path', 'c_curb', 'c_pole_post', 'c_lamp_glow', 'c_bench'])
pp = [(CXY[0] + (RC[j] + 6.0) * cos(TH[j]), CXY[1] + (RC[j] + 6.0) * sin(TH[j])) for j in range(NA)]
pn = nrm(pp, True, 1)
if (pn[0][0] * pp[0][0] + pn[0][1] * (pp[0][1] + 6)) < 0: pn = [(-a, -b) for a, b in pn]
ribbon(pm, pp, pn, [3.4] * NA, 0.05, 'c_path', True, off=-1.7)
acc = 0.0
for j in range(NA):
    a, b = pp[j], pp[(j + 1) % NA]; acc += math.hypot(b[0] - a[0], b[1] - a[1])
    if acc > 13.5:
        acc = 0.0
        x, y = a
        if abs(x) < 9 and y < -80: continue
        if not vis(x, y, 2, 1.1): continue
        nx_, ny_ = pn[j]
        clamp_post(pm, (x - nx_ * 1.9, y - ny_ * 1.9, 0.05), 3.4)
        if j % 3 == 0: cbench(pm, (x + nx_ * 2.2, y + ny_ * 2.2, 0.05), math.atan2(ny_, nx_) + pi / 2)

# ------------------------------------------------------------ far lit houses / kiosks
hs = mks('houses', ['house_a', 'house_b', 'house_c', 'c_roofred', 'c_roofteal', 'window_house', 'cart_dark', 'c_pole_post', 'c_lamp_glow', 'c_curb', 'cart_awn_r', 'cart_awn_w', 'cart_body'])
HOUSES = []
def house(x, y, rz, k):
    hs.push((x, y, hz(x, y)), (0, 0, rz))
    hs.box((7, 0.5, 0.12), (0, -3.6, 0.0), 'c_curb', base=True)
    if k % 3 == 2:      # kiosk
        hs.box((4.4, 3.2, 2.6), (0, 0, 0.0), 'cart_body', bev=0.25, seg=2, base=True)
        for i in range(7): hs.box((0.7, 2.4, 0.12), (-2.1 + i * 0.7, -2.2, 3.1), 'cart_awn_r' if i % 2 == 0 else 'cart_awn_w', rot=(0.3, 0, 0))
        hs.box((3.2, 0.12, 1.2), (0, -1.65, 1.5), 'window_house')
    else:
        wall = ['house_a', 'house_b', 'house_c'][k % 3]
        hs.box((6.4, 5.0, 3.4), (0, 0, 0.0), wall, bev=0.25, seg=2, base=True)
        hs.prism([(-3.6, 3.4), (3.6, 3.4), (0, 6.2)], 5.6, (0, 0, 0), 'c_roofred' if k % 2 == 0 else 'c_roofteal')
        for dx in (-1.9, 1.9): hs.box((1.3, 0.12, 1.3), (dx, -2.55, 1.9), 'window_house')
        hs.box((1.1, 0.12, 2.2), (0, -2.55, 0.0), 'cart_dark', base=True)
        hs.box((0.9, 0.9, 1.4), (2.0, 0.8, 4.0), 'house_a', base=True)
    hs.pop()
    clamp_post(hs, (x + 4.2, y - 3.0, hz(x, y)), 3.0)
for k in range(2000):
    if len(HOUSES) >= 6: break
    th = rs.uniform(0, 2 * pi); d = rs.uniform(16, 34); r = rc_at(th) + d
    x, y = CXY[0] + r * cos(th), CXY[1] + r * sin(th)
    if not vis(x, y, 3, 1.0) or hz(x, y) > 1.2 or any(math.hypot(x - a, y - b) < 24 for a, b in HOUSES) or (abs(x) < 16 and y < -78): continue
    HOUSES.append((x, y)); house(x, y, math.atan2(-cos(th), sin(th)), len(HOUSES) - 1)

# ------------------------------------------------------------ vegetation: fewer, bigger, varied clusters with clearings
st_ = mks('trunks', ['c_trunk'])
sl = mks('leaves', ['c_leaf_a', 'c_leaf_b', 'c_leaf_c', 'c_leaf_d', 'c_leaf_teal', 'c_leaf_pink', 'c_blossom_b', 'c_blossom_c', 'c_pine_a', 'c_pine_b', 'c_bush', 'fl_pink', 'fl_yellow', 'fl_white', 'fl_red', 'fl_violet', 'fl_orange'])
placed = list(HOUSES) and [(a, b, 10.0) for a, b in HOUSES] or []
def clear(x, y, m): return all(math.hypot(x - a, y - b) > m + rr * 0.0 + (rr if rr > 8 else 0) for a, b, rr in placed)
centers = []
for _ in range(6000):
    if len(centers) >= 22: break
    th = rs.uniform(0, 2 * pi); d = rs.uniform(13, 85); r = rc_at(th) + d
    x, y = CXY[0] + r * cos(th), CXY[1] + r * sin(th)
    if not vis(x, y, 3, 1.15) or any(math.hypot(x - a, y - b) < 21 for a, b, _t in centers) or (abs(x) < 14 and y < -78): continue
    if any(math.hypot(x - a, y - b) < 14 for a, b in HOUSES): continue
    centers.append((x, y, ['forest', 'pines', 'cherry', 'meadow', 'forest'][len(centers) % 5]))
cnt = 0
for (cx, cy, kind) in centers:
    R = rs.uniform(12, 20)
    n_try = 130
    pl = []
    for _ in range(n_try):
        a = rs.uniform(0, 6.28); r = abs(rs.gauss(0, R * 0.5))
        x, y = cx + r * cos(a), cy + r * sin(a)
        if not on_land(x, y, 6) or (abs(x) < 8 and y < -76) or not vis(x, y, 2, 1.12): continue
        if any(math.hypot(x - u, y - v) < 4.3 for u, v in pl): continue
        if any(math.hypot(x - a_, y - b_) < 11 for a_, b_ in HOUSES): continue
        pl.append((x, y)); z = hz(x, y) - 0.05
        k = rs.random(); s = rs.uniform(1.0, 1.7)
        if kind == 'meadow':
            if len(pl) < 4: t_round(st_, sl, x, y, z, s, rs)
            else:
                for _f in range(7):
                    fx, fy = x + rs.uniform(-1.6, 1.6), y + rs.uniform(-1.6, 1.6)
                    sl.sphere(0.3, (fx, fy, hz(fx, fy) + 0.5), rs.choice(['fl_pink', 'fl_yellow', 'fl_white', 'fl_red', 'fl_violet', 'fl_orange']), sub=0)
                tuft(sl, x, y, z, rs, 1.4)
            continue
        if kind == 'pines': (t_pine if k < 0.85 else t_round)(st_, sl, x, y, z, s, rs) if k < 0.85 else t_round(st_, sl, x, y, z, s, rs)
        elif kind == 'cherry': (t_cherry if k < 0.7 else t_round)(st_, sl, x, y, z, s, rs)
        else: (t_round if k < 0.5 else t_pine if k < 0.8 else t_cherry)(st_, sl, x, y, z, s, rs)
        cnt += 1
        if rs.random() < 0.5:
            b2 = rs.uniform(0, 6.28); bush(sl, x + 2.8 * s * cos(b2), y + 2.8 * s * sin(b2), z, rs.uniform(1.0, 1.4), rs, flowers=rs.choice([0, 0, 5]))
    placed.append((cx, cy, R))
for _ in range(60):             # lone trees / bushes / rocks in clearings
    th = rs.uniform(0, 2 * pi); r = rc_at(th) + rs.uniform(9, 70)
    x, y = CXY[0] + r * cos(th), CXY[1] + r * sin(th)
    if not on_land(x, y, 6) or not vis(x, y, 2, 1.1) or (abs(x) < 8 and y < -76) or any(math.hypot(x - a_, y - b_) < 12 for a_, b_ in HOUSES): continue
    k = rs.random()
    if k < 0.3: t_round(st_, sl, x, y, hz(x, y) - 0.05, rs.uniform(1.1, 1.6), rs); cnt += 1
    elif k < 0.55: t_cherry(st_, sl, x, y, hz(x, y) - 0.05, rs.uniform(1.0, 1.4), rs); cnt += 1
    elif k < 0.8: bush(sl, x, y, hz(x, y), rs.uniform(1.0, 1.5), rs, flowers=rs.choice([0, 5, 7]))
    else: rock(rk, x, y, hz(x, y) + 0.2, rs.uniform(0.8, 1.8), rs)

for m_ in cs.open: m_.done()
objs = [o for o in bpy.data.objects if o.name.startswith('city_surr')]
print('surroundings:', [(o.name, tris(o)) for o in objs], 'tris', sum(tris(o) for o in objs), 'trees', cnt, 'clusters', len(centers), 'houses', len(HOUSES), 'islets', ISL)
