# Freestyle Paris: a 200 m wrought-iron lattice tower to dive between the legs of and weave
# through, the Seine with stone arch bridges to fly under and tour boats, the triumphal arch on its
# star roundabout with avenues radiating out, Haussmann blocks with zinc mansard roofs, and a
# palace courtyard with a glass pyramid. Lattice, facades and trees are merged per material.
exec(open(r"C:\Users\User\Documents\fly-sim\blender\lib.py").read())
exec(open(r"C:\Users\User\Documents\fly-sim\blender\maplib.py").read())
exec(open(r"C:\Users\User\Documents\fly-sim\blender\detail.py").read())
clear_scene()
random.seed(1889)

pave = surf("stone_pavement", (0.72, 0.69, 0.63), rough=0.8)
asphalt = surf("asphalt_road", (0.17, 0.17, 0.18), rough=0.9)
cobble = surf("stone_cobble", (0.5, 0.48, 0.45), rough=0.9)
walk = surf("concrete_sidewalk", (0.68, 0.66, 0.62))
quay = surf("stone_quay", (0.66, 0.62, 0.54))
riverbed = surf("dirt_riverbed", (0.2, 0.18, 0.14))
water = surf("water_seine", (0.12, 0.24, 0.24), rough=0.04, metallic=0.2)
lawn = surf("grass_lawn", (0.26, 0.48, 0.16))
gravel = surf("dirt_gravel", (0.76, 0.7, 0.58))
iron = surf("metal_tower", (0.34, 0.26, 0.2), metallic=0.6, rough=0.5)
stone_h = [surf("stone_haussmann", (0.86, 0.8, 0.68)), surf("stone_haussmann_warm", (0.88, 0.78, 0.62)),
           surf("stone_haussmann_pale", (0.9, 0.86, 0.78))]
frame_m = surf("stone_frame", (0.8, 0.74, 0.62))
glass_b = surf("window_paris", (0.22, 0.28, 0.32), rough=0.1, metallic=0.5)
zinc = surf("roof_zinc", (0.42, 0.45, 0.5), metallic=0.5, rough=0.45)
balcony = surf("metal_balcony", (0.08, 0.08, 0.09), metallic=0.7, rough=0.5)
chimney_m = surf("brick_chimney", (0.62, 0.38, 0.28))
arc_m = surf("stone_arc", (0.84, 0.8, 0.7))
arc_dark = surf("stone_arc_relief", (0.72, 0.68, 0.58))
glass_pyr = surf("glass_pyramid", (0.6, 0.72, 0.78), rough=0.05, alpha=0.3)
pyr_frame = surf("metal_pyramid", (0.25, 0.27, 0.3), metallic=0.8, rough=0.35)
fountain = surf("water_fountain", (0.15, 0.35, 0.42), rough=0.05)
trunk_m = surf("wood_bark", (0.36, 0.3, 0.22))
leaves = [surf("leaves_plane", (0.2, 0.4, 0.12)), surf("leaves_plane_dark", (0.14, 0.32, 0.1))]
awnings = [surf("fabric_awning_%d" % i, c, rough=0.8) for i, c in enumerate([(0.6, 0.08, 0.1), (0.1, 0.25, 0.15), (0.12, 0.15, 0.35), (0.85, 0.75, 0.55)])]
green = surf("paint_green", (0.1, 0.28, 0.18), rough=0.5)
beacon = surf("lamp_beacon_red", (1.0, 0.05, 0.03), emission=(1.0, 0.05, 0.02), strength=4.0)
lamp_m = surf("lamp_glow", (1.0, 0.95, 0.85), emission=(1.0, 0.92, 0.75), strength=3.0)
boat_glass = surf("glass_boat", (0.3, 0.4, 0.45), rough=0.05, alpha=0.5)

EXT = 500.0
RIVER = (-65.0, -15.0)          # river between the quay walls (y)
WATER_Z, WALK_Z = -6.0, -4.5
ETOILE = (0.0, 300.0)
AVENUES = [k * 45 + 22.5 for k in range(8)]
TOWER = (0.0, -190.0)
TOWER_ZONE = (-100.0, 100.0, -EXT, -88.0)
PALACE = (140.0, 340.0, 20.0, 140.0)

mesh = Mesher()

# ---------------------------------------------------------------- ground, quays, river
box("ground_n", (2 * EXT, EXT - RIVER[1] - 3, 4), (0, (EXT + RIVER[1] + 3) / 2, -2), pave)
box("ground_s", (2 * EXT, EXT + RIVER[0] - 3, 4), (0, (RIVER[0] - 3 - EXT) / 2, -2), pave)
for y in (RIVER[0] - 1.5, RIVER[1] + 1.5):
    box("quay_wall", (2 * EXT, 3, 8), (0, y, -4), quay)
box("river_bed", (2 * EXT, RIVER[1] - RIVER[0], 1), (0, sum(RIVER) / 2, -7.5), riverbed)
box("river", (2 * EXT, RIVER[1] - RIVER[0], 0.3), (0, sum(RIVER) / 2, WATER_Z - 0.15), water)
for y in (RIVER[0] + 2.5, RIVER[1] - 2.5):
    box("lower_quay", (2 * EXT, 5, 3.5), (0, y, WALK_Z - 1.75), quay)
for y in (RIVER[0] - 1.0, RIVER[1] + 1.0):
    box("parapet", (2 * EXT, 0.6, 1.0), (0, y, 0.5), quay)

# Bridges: three stone arches over the water, abutments over the lower quays.
ARCHES = [(-60, -48), (-46, -34), (-32, -20)]
for bx in (-190.0, 0.0, 200.0):
    prof = [(-74, -7.5)]
    for a, b in ARCHES:
        prof.append((a, -7.5))
        for k in range(13):
            t = math.pi * k / 12
            prof.append(((a + b) / 2 - (b - a) / 2 * math.cos(t), -4.9 + 3.6 * math.sin(t)))
        prof.append((b, -7.5))
    prof += [(-6, -7.5), (-6, 0.3), (-74, 0.3)]
    sweep("bridge", [(bx - 8, 0, 0, 1), (bx + 8, 0, 0, 1)], prof, [quay], closed=False)
    box("bridge_road", (11, 68, 0.05), (bx, -40, 0.33), asphalt)
    for s in (-1, 1):
        box("bridge_parapet", (0.6, 68, 1.0), (bx + s * 7.7, -40, 0.8), quay)
        for k in range(5):
            street_lamp((bx + s * 7.7, -60 + k * 10, 1.3), 0 if s > 0 else 180, h=4.0)
    for a, b in ARCHES[:2]:
        # Cutwaters on the piers.
        cyl("cutwater", 1.0, 4.0, (bx - 8, b + 1, WATER_Z + 1.5), quay, segs=8)
        cyl("cutwater", 1.0, 4.0, (bx + 8, b + 1, WATER_Z + 1.5), quay, segs=8)

# Tour boats on the river.
for k, (x, y, yaw) in enumerate(((-110, -50, 0), (90, -28, 180), (300, -44, 0))):
    parts = [box("bateau_hull", (32, 6, 1.6), (0, 0, 0.3), surf("paint_hull_bateau", (0.12, 0.14, 0.18), rough=0.4), bevel=0.3),
             box("bateau_deck", (30, 5.4, 0.1), (0, 0, 1.15), surf("wood_deck", (0.62, 0.48, 0.32))),
             box("bateau_cabin", (22, 5, 2.0), (-1, 0, 2.2), boat_glass),
             box("bateau_roof", (22.4, 5.2, 0.12), (-1, 0, 3.25), surf("paint_white", (0.92, 0.92, 0.9), rough=0.5))]
    o = zero_origin(join(parts, "bateau"))
    o.location = (x, y, WATER_Z - 0.3)
    o.rotation_euler = (0, 0, math.radians(yaw))

# ---------------------------------------------------------------- roads


def in_zone(x, y, z):
    return z[0] <= x <= z[1] and z[2] <= y <= z[3]


def near_avenue(x, y, margin):
    dx, dy = x - ETOILE[0], y - ETOILE[1]
    r = math.hypot(dx, dy)
    if r < 92 + margin:
        return True
    for a in AVENUES:
        ca, sa = math.cos(math.radians(a)), math.sin(math.radians(a))
        along = dx * ca + dy * sa
        if along > 0 and abs(-dx * sa + dy * ca) < 11 + margin:
            return True
    return False


PITCH = 60.0
NS = [-480 + k * PITCH for k in range(17)]
EW_N = [8 + k * PITCH for k in range(9)]
EW_S = [-81 - k * PITCH for k in range(8)]
for y in EW_N + EW_S:
    w = 14 if y in (8, -81) else 12
    if y < 0:
        for xa, xb in ((-EXT, TOWER_ZONE[0]), (TOWER_ZONE[1], EXT)):
            box("road", (xb - xa, w, 0.04), ((xa + xb) / 2, y, 0.02), asphalt)
        if y == -81:
            box("road", (TOWER_ZONE[1] - TOWER_ZONE[0], w, 0.04), (0, y, 0.02), asphalt)
    else:
        box("road", (2 * EXT, w, 0.04), (0, y, 0.02), asphalt)
for x in NS:
    box("road", (12, EXT - 8, 0.04), (x, (EXT + 8) / 2, 0.0205), asphalt)
    if not TOWER_ZONE[0] < x < TOWER_ZONE[1]:
        box("road", (12, EXT - 81, 0.04), (x, -(EXT + 81) / 2, 0.0205), asphalt)
# Star roundabout and its avenues.
for a in AVENUES:
    ca, sa = math.cos(math.radians(a)), math.sin(math.radians(a))
    L = 520
    box("avenue", (L, 22, 0.05), (ETOILE[0] + ca * (74 + L / 2), ETOILE[1] + sa * (74 + L / 2), 0.025), asphalt, rot=(0, 0, math.radians(a)))
ring("etoile_road", 30, 76, 0.06, (ETOILE[0], ETOILE[1], 0.03), cobble, segs=64)
cyl("etoile_plaza", 30.2, 0.08, (ETOILE[0], ETOILE[1], 0.04), pave, segs=64)

# ---------------------------------------------------------------- Haussmann blocks


def mfacade(x, y, w, d, h, floor_h, sides=(0, 1, 2, 3)):
    """facade() for merged meshes: glass, floor bands, piers and two iron balcony bands."""
    floors = max(1, int((h - 0.8) // floor_h))
    top = floors * floor_h
    for side in sides:
        horiz = side in (0, 2)
        length = (w if horiz else d) - 0.6
        off = (d if horiz else w) / 2
        sgn = -1 if side in (0, 3) else 1

        def put(m, along, zc, sx, sz, depth):
            if horiz:
                mesh.cube(m, (sx, depth, sz), (x + along, y + sgn * (off + depth / 2), zc))
            else:
                mesh.cube(m, (depth, sx, sz), (x + sgn * (off + depth / 2), y + along, zc))
        put(glass_b, 0, top / 2 + 0.3, length, top - 0.6, 0.03)
        for f in range(floors + 1):
            put(frame_m, 0, f * floor_h + 0.35, length, 0.7 if f else 1.2, 0.12)
        for f in (2, floors):
            put(balcony, 0, f * floor_h + 0.95, length - 0.4, 0.5, 0.75)
        cols = max(1, int(length // 2.7))
        for c in range(cols + 1):
            put(frame_m, -length / 2 + c * length / cols, top / 2, 0.55, top, 0.09)


def mansard(x, y, w, d, h, m):
    """Zinc roof: steep lower slope, a flat top, dormers and chimneys."""
    bm = mesh._bm(m)
    inset, rise = 2.2, 4.5
    bot = [(x - w / 2, y - d / 2), (x + w / 2, y - d / 2), (x + w / 2, y + d / 2), (x - w / 2, y + d / 2)]
    top = [(x - w / 2 + inset, y - d / 2 + inset), (x + w / 2 - inset, y - d / 2 + inset), (x + w / 2 - inset, y + d / 2 - inset), (x - w / 2 + inset, y + d / 2 - inset)]
    vb = [bm.verts.new((px, py, h)) for px, py in bot]
    vt = [bm.verts.new((px, py, h + rise)) for px, py in top]
    for i in range(4):
        bm.faces.new((vb[i], vb[(i + 1) % 4], vt[(i + 1) % 4], vt[i]))
    bm.faces.new(vt)
    bm.faces.new(vb[::-1])
    # Dormers on the long sides.
    for sgn in (-1, 1):
        n = int((w - 6) // 4.5)
        for k in range(n):
            dx = -((n - 1) * 4.5) / 2 + k * 4.5
            mesh.cube(m, (1.6, 1.6, 2.0), (x + dx, y + sgn * (d / 2 - 1.1), h + 1.6))
            mesh.cube(glass_b, (1.0, 0.05, 1.2), (x + dx, y + sgn * (d / 2 - 0.27), h + 1.5))
    for k in range(random.randint(2, 4)):
        mesh.cube(chimney_m, (1.2, 3.0, 2.2), (x + random.uniform(-w / 2 + 3, w / 2 - 3), y + random.choice((-1, 1)) * (d / 2 - inset - 0.8), h + rise + 1.0))


def haussmann(x, y, w, d, shop_side=None):
    h = random.choice([17.6, 19.2, 20.8])
    mesh.cube(random.choice(stone_h), (w, d, h), (x, y, h / 2))
    mfacade(x, y, w, d, h, 3.2)
    mansard(x, y, w, d, h, zinc)
    mesh.cube(frame_m, (w + 0.5, d + 0.5, 0.5), (x, y, h + 0.25))
    if shop_side is not None and random.random() < 0.6:
        sgn = shop_side
        mesh.cube(random.choice(awnings), (w * 0.8, 1.6, 0.12), (x, y + sgn * (d / 2 + 0.8), 3.2), rot=(sgn * math.radians(12), 0, 0))


cafes = []
for xi in range(len(NS) - 1):
    for yset in (EW_N, EW_S):
        for yi in range(len(yset) - 1):
            xa, xb = NS[xi] + 6, NS[xi + 1] - 6
            ya, yb = sorted((yset[yi], yset[yi + 1]))
            ya += 7 if ya in (8, -81) else 6
            yb -= 7 if yb in (8, -81) else 6
            cx, cy = (xa + xb) / 2, (ya + yb) / 2
            if in_zone(cx, cy, TOWER_ZONE) or in_zone(cx, cy, PALACE):
                continue
            touched = any(near_avenue(px, py, 3) for px in (xa, cx, xb) for py in (ya, cy, yb))
            if not touched:
                box("block_walk", (xb - xa, yb - ya, 0.15), (cx, cy, 0.075), walk)
            inner_w, inner_d = xb - xa - 6, yb - ya - 6
            # Two buildings side by side per block, so the skyline steps.
            for k in (-1, 1):
                bx_ = cx + k * inner_w / 4
                if any(near_avenue(bx_ + sx * inner_w / 4, cy + sy * inner_d / 2, 5) for sx in (-1, 0, 1) for sy in (-1, 0, 1)):
                    continue
                haussmann(bx_, cy, inner_w / 2 - 0.02, inner_d, shop_side=random.choice((-1, 1)))
            if not touched and random.random() < 0.3:
                cafes.append((cx + random.uniform(-10, 10), ya + 1.5 if random.random() < 0.5 else yb - 1.5))
mesh.done("haussmann")
for x, y in cafes:
    for k in range(3):
        parasol((x - 6 + k * 6, y, 0.15), random.choice([(0.6, 0.08, 0.1), (0.95, 0.95, 0.92), (0.1, 0.25, 0.15)]))

# ---------------------------------------------------------------- triumphal arch
ex, ey = ETOILE
AW, AD, AH = 45.0, 22.0, 50.0
MAIN_HW, MAIN_SPRING = 7.3, 21.9      # main arch half-width and springing height (opening 29.2)
SIDE_HW, SIDE_SPRING = 4.2, 14.5      # side arch half-width and springing (opening 18.7)
for s in (-1, 1):
    for t in (-1, 1):
        # Four piers between the main arch (along y) and the side arches (along x).
        mesh.cube(arc_m, (AW / 2 - MAIN_HW, AD / 2 - SIDE_HW, MAIN_SPRING + MAIN_HW), (ex + s * (AW / 2 + MAIN_HW) / 2, ey + t * (AD / 2 + SIDE_HW) / 2, (MAIN_SPRING + MAIN_HW) / 2))
        mesh.cube(arc_dark, (AW / 2 - MAIN_HW - 4, 0.4, 11), (ex + s * (AW / 2 + MAIN_HW) / 2, ey + t * (AD / 2 + 0.2), 9))
    # Over each side arch, with its rounded top stepped in.
    mesh.cube(arc_m, (AW / 2 - MAIN_HW, 2 * SIDE_HW, MAIN_SPRING + MAIN_HW - SIDE_SPRING - SIDE_HW), (ex + s * (AW / 2 + MAIN_HW) / 2, ey, (MAIN_SPRING + MAIN_HW + SIDE_SPRING + SIDE_HW) / 2))
    for k in range(8):
        y0_, y1_ = -SIDE_HW + k * SIDE_HW / 4, -SIDE_HW + (k + 1) * SIDE_HW / 4
        ym = abs((y0_ + y1_) / 2)
        zc = SIDE_SPRING + math.sqrt(max(0.0, SIDE_HW ** 2 - ym ** 2))
        top_ = SIDE_SPRING + SIDE_HW
        if top_ - zc > 0.05:
            mesh.cube(arc_m, (AW / 2 - MAIN_HW, y1_ - y0_, top_ - zc), (ex + s * (AW / 2 + MAIN_HW) / 2, ey + (y0_ + y1_) / 2, (zc + top_) / 2))
mesh.cube(arc_m, (AW, AD, AH - MAIN_SPRING - MAIN_HW), (ex, ey, (AH + MAIN_SPRING + MAIN_HW) / 2))
for k in range(12):
    x0_, x1_ = -MAIN_HW + k * MAIN_HW / 6, -MAIN_HW + (k + 1) * MAIN_HW / 6
    xm = abs((x0_ + x1_) / 2)
    zc = MAIN_SPRING + math.sqrt(max(0.0, MAIN_HW ** 2 - xm ** 2))
    top_ = MAIN_SPRING + MAIN_HW
    if top_ - zc > 0.05:
        mesh.cube(arc_m, (x1_ - x0_, AD, top_ - zc), (ex + (x0_ + x1_) / 2, ey, (zc + top_) / 2))
mesh.cube(arc_dark, (AW + 1.2, AD + 1.2, 1.4), (ex, ey, AH - 9))
mesh.cube(arc_dark, (AW + 0.6, AD + 0.6, 4.0), (ex, ey, AH - 4.0))
mesh.cube(arc_m, (AW + 1.6, AD + 1.6, 0.8), (ex, ey, AH + 0.4))
mesh.done("arc")
for a in AVENUES:
    flag((ex + math.cos(math.radians(a)) * 28, ey + math.sin(math.radians(a)) * 28, 0.08), (0.0, 0.2, 0.6), h=9)

# ---------------------------------------------------------------- palace and glass pyramid
px0, px1, py0, py1 = PALACE
box("palace_court", (px1 - px0, py1 - py0, 0.1), ((px0 + px1) / 2, (py0 + py1) / 2, 0.05), pave)
PH = 22.0
wings = [((px0 + px1) / 2, py1 - 12, px1 - px0, 24, (0,)), (px0 + 12, (py0 + py1 - 24) / 2, 24, py1 - py0 - 24, (1,)), (px1 - 12, (py0 + py1 - 24) / 2, 24, py1 - py0 - 24, (3,))]
for x, y, w, d, sides in wings:
    mesh.cube(stone_h[2], (w, d, PH), (x, y, PH / 2))
    mfacade(x, y, w, d, PH, 4.4)
    mansard(x, y, w, d, PH, zinc)
mesh.done("palace")
pcx, pcy = (px0 + px1) / 2, py0 + 50
pyr = cyl("pyramid", 35 / math.sqrt(2), 21.6, (pcx, pcy, 0.1 + 10.8), glass_pyr, r2=0.0, segs=4, smooth=False)
pyr.rotation_euler = (0, 0, math.radians(45))
apex = Vector((pcx, pcy, 21.7))
corners = [Vector((pcx + sx * 17.5, pcy + sy * 17.5, 0.1)) for sx, sy in ((-1, -1), (1, -1), (1, 1), (-1, 1))]
for i in range(4):
    a, b = corners[i], corners[(i + 1) % 4]
    mesh.beam(pyr_frame, a, apex, 0.35)
    mesh.beam(pyr_frame, a, b, 0.35)
    for k in range(1, 8):
        t = k / 8
        # Horizontal mullions up each face, a few centimetres proud of the glass.
        p = a + (apex - a) * t
        q = b + (apex - b) * t
        n = ((a + b) / 2 - Vector((pcx, pcy, 0.1))).normalized() * 0.08
        mesh.beam(pyr_frame, p + n, q + n, 0.12)
mesh.done("pyramid_frame")
for k, (dx, dy) in enumerate(((0, -32), (-30, 0), (30, 0))):
    box("pool_rim", (14, 14, 0.6), (pcx + dx, pcy + dy, 0.3), quay)
    box("pool", (13, 13, 0.1), (pcx + dx, pcy + dy, 0.56), fountain)

# ---------------------------------------------------------------- the lattice tower
tx, ty = TOWER
H = 200.0
J = 69.0                       # legs join into one shaft at the second floor


def hw(z):
    return 2.5 + 35.0 * math.exp(-z / 38.0)


def leg_w(z):
    return 12.0 + (hw(J) - 12.0) * min(1.0, z / J)


def chord_t(z):
    return 1.3 - 0.7 * min(1.0, z / H)


def lattice(levels, corners_at, brace=0.35):
    """Square lattice column: corner chords, rings at each level and X-bracing on all four faces."""
    for i in range(len(levels) - 1):
        za, zb = levels[i], levels[i + 1]
        A, B = corners_at(za), corners_at(zb)
        t = chord_t(za)
        for k in range(4):
            mesh.beam(iron, A[k], B[k], t, ext=t / 2)
            mesh.beam(iron, B[k], B[(k + 1) % 4], t * 0.7, ext=t * 0.35)
            # Face normal points away from the column centre; offset the two diagonals across it.
            c = (A[0] + A[1] + A[2] + A[3]) / 4
            mid = (A[k] + A[(k + 1) % 4]) / 2
            n = mid - c
            n.z = 0
            n = n.normalized() * brace * 0.6
            mesh.beam(iron, A[k] + n, B[(k + 1) % 4] + n, brace)
            mesh.beam(iron, A[(k + 1) % 4] - n, B[k] - n, brace)
    A = corners_at(levels[0])
    for k in range(4):
        mesh.beam(iron, A[k], A[(k + 1) % 4], chord_t(levels[0]) * 0.7)


LEG_LEVELS = [0, 5, 11, 18, 26, 34, 42, 50, 59, J]
for sx in (-1, 1):
    for sy in (-1, 1):
        def leg_corners(z, sx=sx, sy=sy):
            o, i = hw(z), hw(z) - leg_w(z)
            return [Vector((tx + sx * a, ty + sy * b, z)) for a, b in ((i, i), (o, i), (o, o), (i, o))]
        lattice(LEG_LEVELS, leg_corners)
        mesh.cube(quay, (14, 14, 3), (tx + sx * (hw(0) - 6), ty + sy * (hw(0) - 6), 0.5))


def shaft_corners(z):
    r = hw(z)
    return [Vector((tx + a * r, ty + b * r, z)) for a, b in ((-1, -1), (1, -1), (1, 1), (-1, 1))]


lattice([J, 80, 92, 105, 118, 132, 148, 166], shaft_corners, brace=0.28)
# Decorative arches between the legs under the first floor.
for side in range(4):
    for k in range(16):
        t0, t1 = math.pi * k / 16, math.pi * (k + 1) / 16
        pts = []
        for t in (t0, t1):
            z = 9.0 + 24.0 * math.sin(t)
            u = -(hw(9.0) - leg_w(9.0)) * math.cos(t)
            off = hw(z)
            pts.append((u, off, z))
        a = [Vector(p) for p in pts]
        if side == 0:
            P = [Vector((tx + p.x, ty - p.y, p.z)) for p in a]
        elif side == 1:
            P = [Vector((tx + p.y, ty + p.x, p.z)) for p in a]
        elif side == 2:
            P = [Vector((tx - p.x, ty + p.y, p.z)) for p in a]
        else:
            P = [Vector((tx - p.y, ty - p.x, p.z)) for p in a]
        mesh.beam(iron, P[0], P[1], 0.9, ext=0.3)
        mid = (P[0] + P[1]) / 2
        if 2 <= k <= 13 and k % 2 == 0:
            mesh.beam(iron, mid, Vector((mid.x, mid.y, 34.0)), 0.3)


def deck(z, outer, inner, thick=2.0):
    for s in (-1, 1):
        mesh.cube(iron, (2 * outer, outer - inner, thick), (tx, ty + s * (outer + inner) / 2, z))
        mesh.cube(iron, (outer - inner, 2 * inner, thick), (tx + s * (outer + inner) / 2, ty, z))
    for s in (-1, 1):
        mesh.beam(balcony, (tx - outer, ty + s * outer, z + 2.0), (tx + outer, ty + s * outer, z + 2.0), 0.12)
        mesh.beam(balcony, (tx + s * outer, ty - outer, z + 2.0), (tx + s * outer, ty + outer, z + 2.0), 0.12)


deck(35.0, hw(35) + 3.5, hw(35) - leg_w(35) + 1.5, thick=3.0)
deck(J + 1.0, hw(J) + 2.5, 3.0)
deck(166.0, hw(166) + 1.6, 0.0 + 0.5)
mesh.cube(iron, (6.0, 6.0, 7.0), (tx, ty, 170.5))
mesh.cube(glass_b, (6.4, 6.4, 3.0), (tx, ty, 170.0))
mesh.done("tower")
cyl("tower_dome", 3.2, 3.0, (tx, ty, 175.5), iron, r2=1.0, segs=16)
cyl("tower_mast", 0.7, 22.0, (tx, ty, 188.0), surf("paint_white", (0.92, 0.92, 0.9), rough=0.5), r2=0.25, segs=10)
sphere("tower_beacon", 0.8, (tx, ty, 199.5), beacon)

# Champ-de-Mars: lawns and gravel walks south of the tower, plane tree rows down each side.
box("champ_gravel", (200, 410, 0.06), (tx, (TOWER_ZONE[3] + -EXT) / 2, 0.03), gravel)
for s in (-1, 1):
    box("champ_lawn", (34, 190, 0.1), (tx + s * 24, -360, 0.08), lawn)
box("tower_plaza", (110, 110, 0.04), (tx, ty, 0.08), pave)

# ---------------------------------------------------------------- trees, lamps, kiosks


def plane_tree(x, y, h):
    mesh.beam(trunk_m, (x, y, 0), (x, y, h * 0.55), h * 0.06)
    m = random.choice(leaves)
    blob("plane_crown", h * 0.3, (x, y, h * 0.7), m, scale=(1, 1, 0.85), jitter=0.22)
    blob("plane_crown", h * 0.22, (x + random.uniform(-1, 1), y + random.uniform(-1, 1), h * 0.9), m, scale=(1, 1, 0.85), jitter=0.22)


for s in (-1, 1):
    # Quay rows along both banks.
    for k in range(-24, 25):
        x = k * 20 + 10
        if any(abs(x - bx) < 14 for bx in (-190, 0, 200)):
            continue
        plane_tree(x, RIVER[1] + 6.5 if s > 0 else RIVER[0] - 7.5, random.uniform(11, 14))
for a in AVENUES:
    ca, sa = math.cos(math.radians(a)), math.sin(math.radians(a))
    for k in range(int(420 / 16)):
        r = 90 + k * 16
        for s in (-1, 1):
            x = ETOILE[0] + ca * r - sa * s * 13.5
            y = ETOILE[1] + sa * r + ca * s * 13.5
            if abs(x) > EXT - 10 or y > EXT - 10 or y < RIVER[1] + 12:
                continue
            plane_tree(x, y, random.uniform(10, 13))
for s in (-1, 1):
    for k in range(20):
        y = -110 - k * 19
        for off in (52, 62):
            plane_tree(tx + s * off, y, random.uniform(11, 14))
mesh.done("trees")
for k in range(14):
    x, y = random.choice(NS) + 7.5, random.choice(EW_N[1:]) + 7.5
    if not near_avenue(x, y, 4) and not in_zone(x, y, PALACE):
        cyl("morris_column", 0.7, 3.4, (x, y, 1.7), green, segs=12)
        cyl("morris_cap", 0.9, 0.6, (x, y, 3.6), green, r2=0.3, segs=12)
for k in range(-12, 13):
    x = k * 38 + 19
    street_lamp((x, RIVER[1] + 4.2, 0), 90, h=5)
    street_lamp((x, RIVER[0] - 4.2, 0), -90, h=5)
car_cols = [(0.85, 0.85, 0.85), (0.1, 0.1, 0.1), (0.25, 0.3, 0.4), (0.6, 0.05, 0.05), (0.9, 0.9, 0.85)]
for k in range(60):
    y = random.choice(EW_N[1:])
    x = random.uniform(-460, 460)
    if not near_avenue(x, y, 6) and not in_zone(x, y, PALACE):
        car("car", (x, y + random.choice((-4.2, 4.2)), 0.04), random.choice((90, -90)), random.choice(car_cols), kind=random.choice(["hatch", "hatch", "sedan"]))

empty("spawn", (tx + 30, ty + 65, 0.12), 155)
print(finish_map("public/models/maps/paris.glb"))
