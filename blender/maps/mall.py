# Freestyle mall: three-storey shopping mall whose long central atrium is open to the sky.
# Galleries with glass railings, sky bridges, escalators, a fountain court, shops you can
# fly into, no roof (just open steel trusses) and a car park outside. Through the east entrance a
# round Dome Court whose roof is a giant open lattice ball, open top and bottom to fly through.
exec(open(r"C:\Users\User\Documents\fly-sim\blender\lib.py").read())
exec(open(r"C:\Users\User\Documents\fly-sim\blender\maplib.py").read())
exec(open(r"C:\Users\User\Documents\fly-sim\blender\detail.py").read())
clear_scene()
random.seed(31)

asphalt = surf("asphalt_lot", (0.13, 0.13, 0.14), rough=0.9)
paint = surf("paint_lines", (0.92, 0.92, 0.88), rough=0.6)
floor_m = surf("tile_floor", (0.78, 0.76, 0.72), rough=0.35)
floor_dark = surf("tile_dark", (0.32, 0.31, 0.3), rough=0.35)
slab = surf("concrete_slab", (0.82, 0.82, 0.8))
plaster = surf("plaster_wall", (0.9, 0.88, 0.84))
facade = surf("concrete_facade", (0.66, 0.64, 0.6))
glass_shop = surf("glass_shop", (0.35, 0.45, 0.5), rough=0.05, metallic=0.4)
glass_rail = surf("glass_rail", (0.55, 0.7, 0.72), rough=0.05, metallic=0.2)
steel = surf("metal_steel", (0.55, 0.56, 0.58), metallic=0.9, rough=0.35)
steel_w = surf("metal_white", (0.92, 0.92, 0.9), metallic=0.4, rough=0.4)
dark = surf("metal_dark", (0.1, 0.1, 0.11), metallic=0.7, rough=0.45)
water = surf("water_fountain", (0.1, 0.35, 0.45), rough=0.05, metallic=0.2)
stone = surf("stone_basin", (0.7, 0.68, 0.64))
soil = surf("dirt_planter", (0.25, 0.18, 0.12))
trunk = surf("wood_bark", (0.3, 0.2, 0.12))
palm = surf("leaves_palm", (0.15, 0.42, 0.12))
wood = surf("wood_bench", (0.55, 0.36, 0.2))
fabric = [surf("fabric_banner_red", (0.85, 0.08, 0.1), rough=0.7), surf("fabric_banner_blue", (0.05, 0.25, 0.8), rough=0.7),
          surf("fabric_banner_yellow", (0.95, 0.75, 0.05), rough=0.7)]
signs = [surf("sign_%d" % i, c, emission=c, strength=2.5) for i, c in enumerate(
    [(1.0, 0.2, 0.25), (0.2, 0.6, 1.0), (1.0, 0.75, 0.1), (0.3, 1.0, 0.45), (0.9, 0.3, 1.0), (1.0, 1.0, 1.0)])]
shop_cols = [surf("plaster_shop_%d" % i, c) for i, c in enumerate(
    [(0.85, 0.3, 0.25), (0.25, 0.45, 0.75), (0.95, 0.85, 0.6), (0.3, 0.55, 0.4), (0.6, 0.4, 0.7), (0.2, 0.2, 0.22)])]
screen = surf("screen_led", (0.1, 0.4, 0.9), emission=(0.2, 0.55, 1.0), strength=3.0)
light = surf("lamp_panel", (1.0, 0.97, 0.9), emission=(1.0, 0.95, 0.85), strength=4.0)

# Footprint, atrium void and storey heights (metres).
HX, HY = 70.0, 30.0          # half length / half depth of the building
AX, AY = 56.0, 13.0          # atrium void half sizes
GAL = 4.5                    # gallery walkway depth in front of the shops
LEVELS = [0.0, 6.0, 12.0]    # floor levels
ROOF = 18.0
T = 0.5                      # slab thickness

# Dome Court (east wing): centre, outer radius, open void, shop front radius.
CX, R_OUT, R_VOID, R_SHOP = 132.0, 48.0, 24.0, 33.0
BALL_R = 52.0                          # lattice ball over the whole court: sits on the outer wall
BALL_Z = ROOF + 1.4 + math.sqrt(BALL_R ** 2 - R_OUT ** 2)
BALL_LAT0 = math.degrees(math.asin((ROOF + 1.4 - BALL_Z) / BALL_R))  # where it meets the wall top


# ---------------------------------------------------------------- outside
box("ground", (420, 300, 0.2), (0, 0, -0.1), asphalt)
for row in (-1, 1):
    y0 = row * (HY + 30)
    for k in range(-16, 17):
        box("bay_line", (0.15, 5.0, 0.01), (k * 2.8, y0, 0.005), paint)
    for k in range(-16, 17, 3):
        if random.random() < 0.55:
            car("car_%d_%d" % (row, k), (k * 2.8 + 1.4, y0 + random.choice((-0.2, 0.2)), 0.0), 0 if row < 0 else 180,
                random.choice([(0.7, 0.05, 0.05), (0.05, 0.15, 0.5), (0.85, 0.85, 0.85), (0.1, 0.1, 0.1), (0.9, 0.6, 0.1)]))
    for k in range(-4, 5):
        street_lamp((k * 22, y0 + row * 6, 0), 90 if row < 0 else -90, h=9)
    # Planted islands between the parking rows and the building.
    for k in range(-5, 6):
        planter((k * 13, row * (HY + 12), 0), 2.2, "palm" if k % 2 == 0 else "bush")
        if k % 2:
            bench((k * 13 + 3, row * (HY + 12), 0), 0 if row < 0 else 180)
            bin_((k * 13 - 2.5, row * (HY + 12), 0))
# Entrance plaza at the west end: bollards, flags, palms.
for k in range(-6, 7):
    bollard((-HX - 9, k * 2.2, 0))
for k, c in enumerate([(1, 0.4, 0.05), (0.05, 0.3, 0.9), (0.95, 0.95, 0.95)]):
    flag((-HX - 14, -8 + k * 8, 0), c, h=10)
for k in range(70):
    a = random.uniform(0, math.tau)
    x, y = 165 * math.cos(a) + random.uniform(-8, 8), 128 * math.sin(a) + random.uniform(-8, 8)
    if x > 60 and abs(y) < 60:
        x += 60  # keep clear of the Dome Court
    tree("tree", (x, y, 0), random.uniform(7, 12), random.choice(["palm", "palm", "round"]))

# ---------------------------------------------------------------- floors and roof (ring around the atrium void)


def ring_slab(name, z, material, thick=T):
    box(name, (2 * HX, HY - AY, thick), (0, (HY + AY) / 2, z - thick / 2), material)
    box(name, (2 * HX, HY - AY, thick), (0, -(HY + AY) / 2, z - thick / 2), material)
    box(name, (HX - AX, 2 * AY, thick), ((HX + AX) / 2, 0, z - thick / 2), material)
    box(name, (HX - AX, 2 * AY, thick), (-(HX + AX) / 2, 0, z - thick / 2), material)


box("floor_ground", (2 * HX, 2 * HY, 0.2), (0, 0, 0.1), floor_m)
# Darker tile path down the atrium.
box("floor_path", (2 * AX, 6, 0.01), (0, 0, 0.205), floor_dark)
for z in LEVELS[1:]:
    ring_slab("slab", z, slab)
    ring_slab("floor_upper", z + 0.01, floor_m, thick=0.02)
# No roof at all: the whole hall is open to the sky. A cap runs along the top of the walls.
for s in (-1, 1):
    box("parapet", (2 * HX, 0.6, 1.2), (0, s * HY, ROOF + 0.6), facade)
    box("parapet", (0.6, 2 * HY, 1.2), (s * HX, 0, ROOF + 0.6), facade)

# Open steel roof frame: trusses wall to wall every 8 m, beams along the length, nothing flat.
for k in range(-8, 9):
    x = k * 8.0
    box("truss_chord", (0.5, 2 * HY, 0.5), (x, 0, ROOF + 1.6), steel_w)
    box("truss_chord", (0.35, 2 * HY, 0.35), (x, 0, ROOF - 0.2), steel_w)
    for j in range(-13, 14):
        box("truss_post", (0.2, 0.2, 1.8), (x, j * 2.2, ROOF + 0.7), steel_w)
for y in (0.0, -AY - 0.7, AY + 0.7, -HY + 8, HY - 8):
    box("roof_beam", (2 * HX, 0.4, 0.4), (0, y, ROOF + 2.0), steel_w)

# ---------------------------------------------------------------- exterior walls with big open entrances
for s in (-1, 1):
    # Long walls with glazed bands and big brand signs.
    box("wall_ext", (2 * HX, 0.5, ROOF), (0, s * HY, ROOF / 2), facade)
    for z in (LEVELS[1] + 3.0, LEVELS[2] + 3.0):
        box("glass_band", (2 * HX - 6, 0.1, 2.6), (0, s * (HY + 0.28), z), glass_shop)
    for k in range(-2, 3):
        box("facade_sign", (12, 0.3, 2.4), (k * 26, s * (HY + 0.35), 2.6 + 0 * k), random.choice(signs[:5]))
        box("facade_fin", (0.8, 1.2, ROOF + 2), (k * 26 + 13, s * (HY + 0.5), (ROOF + 2) / 2), steel_w)
    # End walls: entrance 14 m wide x 9 m tall in the middle, open to fly through.
    wall("wall_end", (s * HX, -HY), (s * HX, HY), 0, ROOF, 0.5, facade, openings=[(HY, 14, 0, 9)])
    if s < 0:
        box("entrance_canopy", (6, 18, 0.4), (s * (HX + 3), 0, 9.4), steel)
        box("entrance_sign", (0.4, 16, 3), (s * (HX + 0.3), 0, 12.5), signs[5])
    # Giant LED screen above the inside of the entrance.
    box("led_screen", (0.3, 14, 5), (s * (HX - 0.4), 0, 13.5), screen)

# ---------------------------------------------------------------- shops along both sides on every level
SHOP_W = 12.0
for li, z in enumerate(LEVELS):
    h = (LEVELS[li + 1] if li + 1 < len(LEVELS) else ROOF) - z - T
    for s in (-1, 1):
        front = s * (AY + GAL)
        # Shopfront line: alternating glass panes and open doors, partitions behind.
        x = -HX + 2.0
        n = 0
        while x + SHOP_W <= HX - 2.0 + 1e-6:
            cx = x + SHOP_W / 2
            col = random.choice(shop_cols)
            door = random.uniform(-2.5, 2.5)
            # Glass front with a 4 m wide, 3.5 m tall open doorway.
            wall("shopfront", (x, front), (x + SHOP_W, front), z, h, 0.12, glass_shop, openings=[(SHOP_W / 2 + door, 4.0, 0, 3.5)])
            box("shop_header", (SHOP_W, 0.4, 1.2), (cx, front, z + h - 0.6), col)
            box("shop_sign", (SHOP_W * 0.55, 0.15, 0.7), (cx, front - s * 0.28, z + h - 0.6), random.choice(signs[:5]))
            # Side partition and back wall.
            box("partition", (0.25, HY - AY - GAL, h), (x, s * (AY + GAL + (HY - AY - GAL) / 2), z + h / 2), plaster)
            box("shop_back", (SHOP_W, 0.2, h), (cx, s * (HY - 0.4), z + h / 2), col)
            # Fittings: shelves / racks / counter.
            depth = HY - AY - GAL
            for r in range(random.randint(1, 3)):
                ry = s * (AY + GAL + 3 + r * (depth - 5) / 3)
                box("shelf", (SHOP_W * 0.6, 0.6, random.uniform(1.2, 2.0)), (cx, ry, z + 0.9), random.choice([wood, steel, dark]))
            box("counter", (2.5, 0.8, 1.0), (cx + random.uniform(-3, 3), s * (HY - 3), z + 0.5), wood)
            if li + 1 < len(LEVELS):  # the top floor is open to the sky
                box("ceiling_light", (SHOP_W * 0.7, 0.6, 0.05), (cx, s * (AY + GAL + depth / 2), z + h - 0.05), light)
            x += SHOP_W
            n += 1
        box("partition", (0.25, HY - AY - GAL, h), (x, s * (AY + GAL + (HY - AY - GAL) / 2), z + h / 2), plaster)
        # Gallery ceiling light strip.
        if li + 1 < len(LEVELS):
            box("gallery_light", (2 * HX - 4, 0.4, 0.05), (0, s * (AY + GAL / 2), z + h - 0.05), light)

# ---------------------------------------------------------------- atrium edge: glass railings, columns
for z in LEVELS[1:]:
    for s in (-1, 1):
        box("rail_glass", (2 * AX, 0.05, 1.05), (0, s * AY, z + 0.55), glass_rail)
        box("rail_top", (2 * AX, 0.1, 0.06), (0, s * AY, z + 1.1), steel)
        box("rail_glass", (0.05, 2 * AY, 1.05), (s * AX, 0, z + 0.55), glass_rail)
        box("rail_top", (0.1, 2 * AY, 0.06), (s * AX, 0, z + 1.1), steel)
        box("slab_edge", (2 * AX, 0.3, 0.9), (0, s * AY, z - 0.45), steel_w)
for k in range(-3, 4):
    for s in (-1, 1):
        cyl("column", 0.5, ROOF, (k * 16.0, s * (AY + 0.7), ROOF / 2), steel_w, segs=16)

# Sky bridges across the atrium on both upper levels (fly under, over or between).
for z, bx in ((LEVELS[1], -24.0), (LEVELS[1], 24.0), (LEVELS[2], 0.0)):
    box("bridge", (5.0, 2 * AY, T), (bx, 0, z - T / 2), slab)
    box("bridge_floor", (5.0, 2 * AY, 0.02), (bx, 0, z + 0.01), floor_m)
    for sx in (-1, 1):
        box("rail_glass", (0.05, 2 * AY, 1.05), (bx + sx * 2.5, 0, z + 0.55), glass_rail)
        box("rail_top", (0.1, 2 * AY, 0.06), (bx + sx * 2.5, 0, z + 1.1), steel)

# Escalators in the atrium (ground -> 1 at the ends, 1 -> 2 in the middle).
ESC = (LEVELS[1] - LEVELS[0]) / math.tan(math.radians(30))


def escalator(x0, z0, z1, side, direction):
    run = (z1 - z0) / math.tan(math.radians(30))
    ang = math.atan2(z1 - z0, run) * direction
    y = side * (AY - 2.0)
    cx = x0 + direction * run / 2
    box("escalator", (run + 2, 1.6, 0.8), (cx, y, (z0 + z1) / 2 + 0.2), dark, rot=(0, -ang, 0))
    for sy in (-1, 1):
        box("escalator_side", (run + 2, 0.12, 1.1), (cx, y + sy * 0.86, (z0 + z1) / 2 + 0.9), glass_rail, rot=(0, -ang, 0))


for s in (-1, 1):
    # Ground -> level 1, landing on the end galleries.
    escalator(-AX + ESC, LEVELS[0], LEVELS[1], s, -1)
    escalator(AX - ESC, LEVELS[0], LEVELS[1], s, 1)

# ---------------------------------------------------------------- ground floor court
cyl("fountain_basin", 7.5, 0.7, (0, 0, 0.55), stone, segs=40)
cyl("fountain_water", 7.0, 0.1, (0, 0, 0.85), water, segs=40)
cyl("fountain_tier", 2.5, 2.4, (0, 0, 1.4), stone, segs=24)
cyl("fountain_top", 1.2, 1.2, (0, 0, 3.0), stone, segs=20)
for x in (-40, -28, 28, 40):
    for s in (-1, 1):
        cyl("planter", 1.6, 0.9, (x, s * 4.5, 0.65), stone, segs=16)
        cyl("planter_soil", 1.45, 0.1, (x, s * 4.5, 1.12), soil, segs=16)
        palm_tree("palm", (x, s * 4.5, 1.1), random.uniform(7, 10))
for x in (-16, 16):
    # Kiosks.
    box("kiosk", (4, 3, 1.1), (x, 0, 0.75), wood)
    box("kiosk_roof", (5, 4, 0.2), (x, 0, 3.2), random.choice(shop_cols))
    for sx in (-1, 1):
        cyl("kiosk_post", 0.08, 2.6, (x + sx * 2.2, 0, 1.9), steel, segs=8)
for k in range(12):
    s = random.choice((-1, 1))
    bench((random.uniform(-50, 50), s * random.uniform(6.5, 8.5), 0.2), 0 if s > 0 else 180)
for k in range(8):
    bin_((random.uniform(-50, 50), random.choice((-1, 1)) * 9.5, 0.2))

# Food court tables on the top floor gallery ends.
for s in (-1, 1):
    for k in range(6):
        x = s * (AX + 4 + (k % 3) * 3.5)
        y = -6 + (k // 3) * 8
        cyl("table", 0.6, 0.05, (x, y, LEVELS[2] + 0.75), steel_w, segs=12)
        cyl("table_leg", 0.05, 0.75, (x, y, LEVELS[2] + 0.38), steel, segs=6)

# Hanging banners and a big hanging sculpture of rings in the atrium.
for k in range(-5, 6):
    if k == 0:
        continue
    for s in (-1, 1):
        x = k * 8.0 + 4
        box("banner", (0.05, 1.4, 4.0), (x, s * (AY - 2.5), ROOF - 3.0), random.choice(fabric))
        cyl("banner_wire", 0.01, 1.2, (x, s * (AY - 2.5), ROOF - 0.4), steel, segs=4)
for k, (x, z, r) in enumerate(((-36, 9.5, 2.0), (36, 9.5, 2.0), (0, 15.0, 3.0))):
    o = ring("hoop", r - 0.18, r, 0.25, (x, 0, z), signs[k % 3], segs=36)
    o.rotation_euler = (math.radians(90), 0, math.radians(90))

# ---------------------------------------------------------------- Dome Court
# Corridor from the east entrance to the court.
CORR_X0, CORR_X1 = HX, CX - R_OUT + 0.5
cl = CORR_X1 - CORR_X0
box("corridor_floor", (cl, 14.4, 0.2), ((CORR_X0 + CORR_X1) / 2, 0, 0.1), floor_m)
# Open top: cross beams only.
for k in range(int(cl // 4) + 1):
    box("corridor_beam", (0.35, 15.0, 0.5), (CORR_X0 + 1 + k * (cl - 2) / max(1, int(cl // 4)), 0, 9.65), steel_w)
for sy in (-1, 1):
    box("corridor_edge", (cl + 1, 0.4, 0.5), ((CORR_X0 + CORR_X1) / 2, sy * 7.2, 9.65), steel_w)
for sy in (-1, 1):
    box("corridor_glass", (cl, 0.1, 9.4), ((CORR_X0 + CORR_X1) / 2, sy * 7.2, 4.7), glass_shop)
    nm = max(1, int(cl // 3))
    for k in range(nm + 1):
        box("corridor_mullion", (0.2, 0.25, 9.4), (CORR_X0 + k * cl / nm, sy * 7.2, 4.7), steel_w)


def polar(r, a, z=0.0):
    return (CX + r * math.cos(a), r * math.sin(a), z)


def arc_box(name, r, a, width, depth, z0, z1, material):
    x, y, _ = polar(r, a)
    return box(name, (depth, width, z1 - z0), (x, y, (z0 + z1) / 2), material, rot=(0, 0, a))


cyl("court_floor", R_OUT, 0.2, (CX, 0, 0.1), floor_m, segs=96)
cyl("court_floor_inlay", R_VOID - 1, 0.01, (CX, 0, 0.205), floor_dark, segs=96)
for z in LEVELS[1:]:
    ring("court_slab", R_VOID, R_OUT, T, (CX, 0, z - T / 2), slab, segs=96)
    ring("court_floor_up", R_VOID, R_OUT, 0.02, (CX, 0, z + 0.01), floor_m, segs=96)
    ring("court_slab_edge", R_VOID - 0.15, R_VOID, 0.9, (CX, 0, z - 0.45), steel_w, segs=96)
    ring("court_rail_glass", R_VOID - 0.03, R_VOID + 0.03, 1.05, (CX, 0, z + 0.55), glass_rail, segs=96)
    ring("court_rail_top", R_VOID - 0.06, R_VOID + 0.06, 0.06, (CX, 0, z + 1.1), steel, segs=96)
    ring("court_gallery_light", R_VOID + 2.5, R_VOID + 3.0, 0.05, (CX, 0, z - T - 0.03), light, segs=96)
# No flat roof here either: open to the sky, with steel spokes from the ball's collar to the wall.
ring("court_parapet", R_OUT - 0.6, R_OUT, 1.2, (CX, 0, ROOF + 0.6), facade, segs=96)
for k in range(32):
    a = (k + 0.5) * math.tau / 32
    x, y, _ = polar((R_VOID + R_OUT) / 2, a)
    box("court_spoke", (R_OUT - R_VOID, 0.45, 0.6), (x, y, ROOF + 0.5), steel_w, rot=(0, 0, a))
ring("court_purlin", R_SHOP - 0.2, R_SHOP + 0.2, 0.4, (CX, 0, ROOF + 0.9), steel_w, segs=96)

# Outer wall: straight panels around the circle, with entrances west (corridor) and east.
NSEG = 72
seg_w = 2 * math.pi * R_OUT / NSEG + 0.15
for k in range(NSEG):
    a = (k + 0.5) * math.tau / NSEG
    door = abs(R_OUT * math.sin(a)) < 7.2
    if door:
        arc_box("court_wall", R_OUT, a, seg_w, 0.5, 9.4, ROOF + T, facade)
    else:
        arc_box("court_wall", R_OUT, a, seg_w, 0.5, 0, ROOF + T, facade)
        for z in (LEVELS[1] + 3.0, LEVELS[2] + 3.0):
            arc_box("court_glass_band", R_OUT + 0.28, a, seg_w, 0.08, z - 1.3, z + 1.3, glass_shop)
    if k % 4 == 0 and not door:
        arc_box("court_fin", R_OUT + 0.5, a, 0.8, 1.2, 0, ROOF + 2, steel_w)
box("court_canopy", (6, 18, 0.4), (CX + R_OUT + 3, 0, 9.4), steel)
box("court_sign", (0.4, 16, 3), (CX + R_OUT + 0.3, 0, 12.5), signs[1])

# Ring of shops: curved glass fronts made of straight panes, one doorway pane per shop.
NSHOP = 16
PANES = 6
for li, z in enumerate(LEVELS):
    h = (LEVELS[li + 1] if li + 1 < len(LEVELS) else ROOF) - z - T
    for sh in range(NSHOP):
        a0 = sh * math.tau / NSHOP
        col = random.choice(shop_cols)
        mid_a = a0 + math.pi / NSHOP
        # The ground floor has no shops where the corridor and the east entrance come in.
        if li == 0 and abs(math.sin(mid_a)) < 0.35:
            continue
        door_pane = random.randint(1, PANES - 2)
        pane_w = 2 * math.pi * R_SHOP / (NSHOP * PANES) + 0.05
        for p in range(PANES):
            a = a0 + (p + 0.5) * math.tau / (NSHOP * PANES)
            lo = 3.5 if p == door_pane else 0
            arc_box("court_shopfront", R_SHOP, a, pane_w, 0.1, z + lo, z + h - 1.2, glass_shop)
            arc_box("court_shop_header", R_SHOP, a, pane_w, 0.4, z + h - 1.2, z + h, col)
        arc_box("court_shop_sign", R_SHOP - 0.3, mid_a, 6.0, 0.15, z + h - 1.0, z + h - 0.3, random.choice(signs[:5]))
        x, y, _ = polar((R_SHOP + R_OUT) / 2, a0)
        box("court_partition", (R_OUT - R_SHOP, 0.25, h), (x, y, z + h / 2), plaster, rot=(0, 0, a0))
        if li + 1 < len(LEVELS):
            arc_box("court_shop_light", (R_SHOP + R_OUT) / 2, mid_a, 4.0, 2.0, z + h - 0.06, z + h - 0.01, light)
        for r_ in range(2):
            arc_box("court_shelf", R_SHOP + 3 + r_ * 3.5, mid_a + random.uniform(-0.08, 0.08), 3.0, 0.6, z, z + random.uniform(1.2, 2.0), random.choice([wood, steel, dark]))
for k in range(16):
    a = (k + 0.5) * math.tau / 16
    x, y, _ = polar(R_VOID + 0.9, a)
    cyl("court_column", 0.5, ROOF, (x, y, ROOF / 2), steel_w, segs=16)

# Ground floor of the court: a round pool with jets, palms, benches.
cyl("pool_rim", 13.0, 0.6, (CX, 0, 0.5), stone, segs=48)
cyl("pool_water", 12.5, 0.1, (CX, 0, 0.78), surf("water_pool", (0.05, 0.55, 0.62), rough=0.05), segs=48)
for k in range(8):
    a = k * math.tau / 8
    x, y, _ = polar(10.0, a)
    cyl("pool_jet", 0.12, 0.5, (x, y, 1.0), steel, segs=8)
for k in range(6):
    a = k * math.tau / 6 + 0.3
    x, y, _ = polar(18.0, a)
    planter((x, y, 0.2), 2.0, "palm")
    x, y, _ = polar(18.0, a + 0.52)
    bench((x, y, 0.2), math.degrees(a + 0.52) + 90)

# The ball: a 104 m lattice sphere resting on the court's outer wall, so it covers the whole
# court. Meridian ribs and latitude rings from the wall top up to an opening at the top.
NMER = 32
NSTEP = 14
for m_ in range(NMER):
    lon = m_ * math.tau / NMER
    pts_ = []
    for k in range(NSTEP + 1):
        lat = math.radians(BALL_LAT0 + (67.5 - BALL_LAT0) * k / NSTEP)
        pts_.append(Vector((CX + BALL_R * math.cos(lat) * math.cos(lon), BALL_R * math.cos(lat) * math.sin(lon), BALL_Z + BALL_R * math.sin(lat))))
    for k in range(NSTEP):
        a, b = pts_[k], pts_[k + 1]
        d = b - a
        rib = box("ball_rib", (0.6, 0.6, d.length + 0.1), (a + b) / 2, steel_w)
        rib.rotation_euler = d.to_track_quat("Z", "Y").to_euler()
for lat in (BALL_LAT0, -10.0, 0.0, 15.0, 30.0, 45.0, 57.0, 67.5):
    r = BALL_R * math.cos(math.radians(lat))
    ring("ball_ring", r - 0.3, r + 0.3, 0.6, (CX, 0, BALL_Z + BALL_R * math.sin(math.radians(lat))), steel_w, segs=128)
# Glowing bands on the equator and around the top opening.
for lat in (0.0, 67.5):
    r = BALL_R * math.cos(math.radians(lat))
    ring("ball_glow", r - 0.05, r + 0.35, 0.16, (CX, 0, BALL_Z + BALL_R * math.sin(math.radians(lat)) + 0.38), signs[1], segs=96)
# Collar where the ball sits on the wall.
ring("ball_collar", R_OUT - 1.2, R_OUT + 0.8, 0.8, (CX, 0, ROOF + 1.6), steel_w, segs=128)
# A hoop in the middle of the ball to thread.
o = ring("ball_hoop", 5.5, 6.1, 0.5, (CX, 0, BALL_Z), signs[2], segs=40)
o.rotation_euler = (math.radians(90), 0, 0)

empty("spawn", (-AX + 12, -2.0, 0.21), -90)
print(finish_map("public/models/maps/mall.glb"))
