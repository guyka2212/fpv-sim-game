# Tiny-whoop house: living room, open kitchen, hallway, bedroom, bathroom and office,
# fully furnished at real scale, with six whoop hoops for a race line.
exec(open(r"C:\Users\User\Documents\fly-sim\blender\lib.py").read())
exec(open(r"C:\Users\User\Documents\fly-sim\blender\maplib.py").read())
exec(open(r"C:\Users\User\Documents\fly-sim\blender\detail.py").read())
clear_scene()
random.seed(11)

H = 2.6
T = 0.12
wall_m = surf("plaster_wall", (0.88, 0.86, 0.8), rough=0.9)
ceiling_m = surf("plaster_ceiling", (0.95, 0.95, 0.93), rough=0.9)
wood_floor = surf("wood_floor", (0.55, 0.38, 0.22), rough=0.55)
tile = surf("tile_floor", (0.82, 0.82, 0.8), rough=0.35)
carpet = surf("carpet_grey", (0.45, 0.47, 0.5), rough=1.0)
fabric = surf("fabric_sofa", (0.2, 0.32, 0.45), rough=0.95)
fabric2 = surf("fabric_bed", (0.85, 0.82, 0.75), rough=0.95)
oak = surf("wood_oak", (0.62, 0.45, 0.28), rough=0.5)
dark_wood = surf("wood_dark", (0.25, 0.16, 0.1), rough=0.5)
white = surf("paint_white", (0.92, 0.92, 0.9), rough=0.4)
black = surf("plastic_black", (0.03, 0.03, 0.03), rough=0.3)
steel = surf("metal_steel", (0.75, 0.75, 0.78), metallic=0.9, rough=0.25)
rug = surf("carpet_rug", (0.6, 0.18, 0.15), rough=1.0)
plant = surf("leaves_plant", (0.15, 0.45, 0.12), rough=0.8)
glass = surf("glass_window", (0.6, 0.75, 0.85), rough=0.05, alpha=0.18)
hoop_m = surf("plastic_hoop", (1.0, 0.25, 0.6), rough=0.4, emission=(1.0, 0.2, 0.55), strength=0.6)
grass = surf("grass_lawn", (0.2, 0.45, 0.12))
trunk = surf("wood_bark", (0.25, 0.16, 0.09))
leaves = surf("leaves_green", (0.12, 0.33, 0.08))
lamp_m = surf("lamp_glow", (1.0, 0.95, 0.8), emission=(1.0, 0.92, 0.75), strength=4.0)

# Floors and ceiling.
box("yard", (70, 70, 0.1), (0, 0, -0.06), grass)
box("floor_living", (8, 6.5, 0.02), (-3, -1.75, 0.01), wood_floor)
box("floor_kitchen", (6, 6.5, 0.02), (4, -1.75, 0.01), tile)
box("floor_hall", (14, 1.2, 0.02), (0, 2.1, 0.01), wood_floor)
box("floor_bed", (7, 2.3, 0.02), (-3.5, 3.85, 0.01), carpet)
box("floor_bath", (3, 2.3, 0.02), (1.5, 3.85, 0.01), tile)
box("floor_office", (4, 2.3, 0.02), (5, 3.85, 0.01), wood_floor)
box("ceiling", (14.2, 10.2, 0.12), (0, 0, H + 0.06), ceiling_m)
box("roof", (15.5, 11.5, 0.3), (0, 0, H + 0.3), surf("roof_tiles", (0.45, 0.2, 0.15), rough=0.8))

W = (1.0, 1.4, 0.9, 2.1)  # window: width, sill, top
# Exterior walls: (p0, p1, openings as (center, width, sill, top)).
ext = [
    ((-7, -5), (7, -5), [(2, 1.4, 0.9, 2.1), (5, 1.4, 0.9, 2.1), (10, 1.2, 0.9, 2.1), (12.5, 1.0, 0.9, 2.1)]),
    ((-7, 5), (7, 5), [(2, 1.2, 0.9, 2.1), (5, 1.2, 0.9, 2.1), (8.5, 0.6, 1.4, 2.1), (11.5, 1.2, 0.9, 2.1)]),
    ((-7, -5), (-7, 5), [(3, 1.6, 0.9, 2.1), (6.6, 1.0, 0.0, 2.1)]),  # front door at y=1.6
    ((7, -5), (7, 5), [(2.5, 1.2, 0.9, 2.1), (8.5, 1.0, 0.9, 2.1)]),
]
for p0, p1, ops in ext:
    wall("wall_ext", p0, p1, 0, H, T * 1.5, wall_m, ops)
    for c, w, sill, top in ops:
        if sill > 0.1:
            # Glass pane in each window.
            L = math.hypot(p1[0] - p0[0], p1[1] - p0[1])
            dx, dy = (p1[0] - p0[0]) / L, (p1[1] - p0[1]) / L
            box("glass", (w, 0.01, top - sill), (p0[0] + dx * c, p0[1] + dy * c, (sill + top) / 2), glass, rot=(0, 0, math.atan2(dy, dx)))

DOOR = 2.05
interior = [
    ((-7, 1.5), (7, 1.5), [(4, 1.4, 0, DOOR), (11, 1.0, 0, DOOR)]),
    ((1, -5), (1, 1.5), [(3.5, 3.0, 0, DOOR + 0.2)]),
    ((-7, 2.7), (7, 2.7), [(3.5, 0.9, 0, DOOR), (8.5, 0.8, 0, DOOR), (12, 0.9, 0, DOOR)]),
    ((0, 2.7), (0, 5), []),
    ((3, 2.7), (3, 5), []),
]
for p0, p1, ops in interior:
    wall("wall_int", p0, p1, 0, H, T, wall_m, ops)

# ---- Living room.
box("sofa_base", (2.2, 0.9, 0.42), (-4, -4.3, 0.21), fabric, bevel=0.04)
box("sofa_back", (2.2, 0.22, 0.85), (-4, -4.65, 0.43), fabric, bevel=0.05)
for sx in (-1, 1):
    box("sofa_arm", (0.22, 0.9, 0.62), (-4 + sx * 1.1, -4.3, 0.31), fabric, bevel=0.05)
box("cushion", (0.45, 0.15, 0.4), (-4.6, -4.45, 0.62), rug, bevel=0.05)
box("coffee_table", (1.2, 0.6, 0.04), (-4, -2.8, 0.44), oak)
for sx in (-1, 1):
    for sy in (-1, 1):
        box("table_leg", (0.04, 0.04, 0.42), (-4 + sx * 0.55, -2.8 + sy * 0.25, 0.21), dark_wood)
box("rug", (3.0, 2.0, 0.01), (-4, -3.0, 0.025), rug)
box("tv_stand", (1.8, 0.42, 0.5), (-4, 1.2, 0.25), dark_wood)
box("tv", (1.4, 0.05, 0.8), (-4, 1.25, 0.98), black)
box("bookshelf_back", (0.03, 1.6, 2.0), (-6.94, -1.4, 1.0), oak)
for sy_ in (-0.79, 0.79):
    box("bookshelf_side", (0.35, 0.03, 2.0), (-6.78, -1.4 + sy_, 1.0), oak)
box("bookshelf_top", (0.35, 1.6, 0.03), (-6.78, -1.4, 1.99), oak)
for k in range(5):
    box("shelf_board", (0.33, 1.56, 0.03), (-6.76, -1.4, 0.06 + k * 0.4), dark_wood)
cyl("floor_lamp", 0.015, 1.6, (-5.6, -4.5, 0.8), steel, segs=8)
cyl("lamp_shade", 0.22, 0.3, (-5.6, -4.5, 1.65), lamp_m, r2=0.14, segs=16)
cyl("pot", 0.18, 0.35, (-6.5, 0.9, 0.18), white, segs=14)
sphere("plant", 0.35, (-6.5, 0.9, 0.7), plant, scale=(1, 1, 1.3), segs=10, rings=7)
box("armchair", (0.9, 0.9, 0.45), (-1.6, -3.5, 0.22), fabric, rot=(0, 0, 0.6), bevel=0.04)

# ---- Kitchen / dining.
box("counter", (5.0, 0.62, 0.9), (4.0, -4.69, 0.45), white)
box("countertop", (5.05, 0.65, 0.04), (4.0, -4.69, 0.92), dark_wood)
box("upper_cabinets", (5.0, 0.35, 0.7), (4.0, -4.82, 1.85), white)
box("hood", (0.8, 0.5, 0.3), (5.0, -4.7, 1.6), steel)
box("fridge", (0.8, 0.72, 1.85), (6.55, -1.2, 0.93), steel, bevel=0.02)
box("island", (2.0, 1.0, 0.9), (4.0, -2.4, 0.45), white)
box("island_top", (2.1, 1.1, 0.04), (4.0, -2.4, 0.92), dark_wood)
for k in range(3):
    cyl("stool", 0.18, 0.04, (3.3 + k * 0.7, -1.6, 0.68), black, segs=12)
    cyl("stool_leg", 0.025, 0.66, (3.3 + k * 0.7, -1.6, 0.33), steel, segs=6)
box("dining_table", (1.6, 0.9, 0.04), (4.0, 0.3, 0.75), oak)
for sx in (-1, 1):
    for sy in (-1, 1):
        box("table_leg", (0.05, 0.05, 0.73), (4.0 + sx * 0.72, 0.3 + sy * 0.38, 0.365), oak)
for sx in (-0.45, 0.45):
    for sy in (-1, 1):
        cx, cy = 4.0 + sx, 0.3 + sy * 0.7
        box("chair_seat", (0.42, 0.42, 0.04), (cx, cy, 0.45), oak)
        box("chair_back", (0.42, 0.04, 0.45), (cx, cy + sy * 0.2, 0.7), oak)
        for lx in (-1, 1):
            for ly in (-1, 1):
                box("chair_leg", (0.03, 0.03, 0.44), (cx + lx * 0.18, cy + ly * 0.18, 0.22), oak)

# ---- Bedroom.
box("bed_frame", (1.7, 2.1, 0.35), (-5, 3.9, 0.18), dark_wood)
box("mattress", (1.6, 2.0, 0.22), (-5, 3.9, 0.46), fabric2, bevel=0.05)
box("headboard", (1.7, 0.08, 1.0), (-5, 4.92, 0.5), dark_wood)
box("pillow", (0.6, 0.35, 0.12), (-5.4, 4.6, 0.62), white, bevel=0.04)
box("pillow", (0.6, 0.35, 0.12), (-4.6, 4.6, 0.62), white, bevel=0.04)
for sx in (-1, 1):
    box("nightstand", (0.45, 0.4, 0.5), (-5 + sx * 1.15, 4.75, 0.25), oak)
box("wardrobe", (1.6, 0.6, 2.1), (-1.0, 4.65, 1.05), oak)

# ---- Bathroom and office.
box("bathtub", (1.6, 0.75, 0.55), (1.2, 4.55, 0.28), white, bevel=0.06)
box("sink", (0.6, 0.45, 0.85), (2.55, 3.1, 0.43), white)
box("desk", (1.5, 0.7, 0.04), (5.2, 4.55, 0.75), oak)
for sx in (-1, 1):
    box("desk_leg", (0.05, 0.6, 0.73), (5.2 + sx * 0.7, 4.55, 0.37), black)
box("monitor", (0.6, 0.04, 0.36), (5.2, 4.75, 1.0), black)
box("office_chair", (0.5, 0.5, 0.1), (5.2, 3.8, 0.48), black)
box("office_chair_back", (0.5, 0.08, 0.6), (5.2, 3.55, 0.85), black)
cyl("office_chair_post", 0.03, 0.45, (5.2, 3.8, 0.22), steel, segs=8)
box("console", (1.0, 0.35, 0.8), (-6.3, 2.1, 0.4), oak)

# Ceiling lights (emissive discs) + light markers the game turns into point lights.
for k, (x, y) in enumerate([(-4, -2), (4, -2.0), (-3.5, 3.9), (5, 3.9), (1.5, 3.9), (0, 2.1)]):
    cyl("ceiling_light", 0.22, 0.05, (x, y, H - 0.03), lamp_m, segs=16)
    empty("light_%02d_marker" % (k + 1), (x, y, H - 0.2))

# ---- Detail pass: curtains, books, plants, small things on every surface.
curtain_m = surf("fabric_curtain", (0.82, 0.76, 0.62), rough=0.95)
frame_m = surf("wood_frame", (0.15, 0.12, 0.1))
art = [surf("paint_art_%d" % i, c, rough=0.6) for i, c in enumerate([(0.9, 0.5, 0.2), (0.2, 0.5, 0.7), (0.7, 0.2, 0.3), (0.3, 0.6, 0.35)])]
ceramic = surf("paint_ceramic", (0.95, 0.95, 0.93), rough=0.2)
fruit = [surf("paint_fruit_%d" % i, c, rough=0.5) for i, c in enumerate([(0.9, 0.15, 0.1), (0.95, 0.75, 0.1), (0.3, 0.7, 0.15)])]
inward = {(-5, 0): (0, 1), (5, 0): (0, -1)}
for p0, p1, ops in ext:
    L = math.hypot(p1[0] - p0[0], p1[1] - p0[1])
    dx, dy = (p1[0] - p0[0]) / L, (p1[1] - p0[1]) / L
    nx_, ny_ = -dy, dx
    # Point the normal into the house.
    mx, my = (p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2
    if nx_ * -mx + ny_ * -my < 0:
        nx_, ny_ = -nx_, -ny_
    for c, w, sill, top in ops:
        if sill < 0.1:
            continue
        for side in (-1, 1):
            cx_ = p0[0] + dx * (c + side * (w / 2 + 0.18)) + nx_ * 0.16
            cy_ = p0[1] + dy * (c + side * (w / 2 + 0.18)) + ny_ * 0.16
            box("curtain", (0.4, 0.06, H - 0.25), (cx_, cy_, (H - 0.25) / 2 + 0.05), curtain_m, rot=(0, 0, math.atan2(dy, dx)))
        rx_ = p0[0] + dx * c + nx_ * 0.2
        ry_ = p0[1] + dy * c + ny_ * 0.2
        box("curtain_rod", (w + 1.0, 0.03, 0.03), (rx_, ry_, H - 0.15), steel, rot=(0, 0, math.atan2(dy, dx)))
        box("window_sill", (w + 0.1, 0.22, 0.04), (p0[0] + dx * c + nx_ * 0.08, p0[1] + dy * c + ny_ * 0.08, sill), white, rot=(0, 0, math.atan2(dy, dx)))

# Individual books on the living-room shelf.
for k in range(5):
    y = -2.15
    while y < -0.7:
        bw = random.uniform(0.03, 0.07)
        bh = random.uniform(0.2, 0.32)
        box("book", (0.22, bw, bh), (-6.72, y, 0.08 + k * 0.4 + bh / 2), surf("books_%d" % (k % 3), [(0.6, 0.1, 0.1), (0.1, 0.3, 0.6), (0.8, 0.7, 0.2)][k % 3]))
        y += bw + 0.005
# Pictures on the walls.
for x, y, z, yaw, w, h in ((-4.0, -4.92, 1.6, 0, 1.0, 0.7), (-2.0, 1.42, 1.5, 0, 0.6, 0.8), (-5.0, 2.78, 1.5, 0, 0.9, 0.6),
                          (4.0, 1.42, 1.6, 0, 1.1, 0.6), (6.92, 3.9, 1.4, 90, 0.7, 0.5)):
    box("frame", (w + 0.06, 0.03, h + 0.06), (x, y, z), frame_m, rot=(0, 0, math.radians(yaw)))
    box("art", (w, 0.035, h), (x, y, z), random.choice(art), rot=(0, 0, math.radians(yaw)))
# Potted plants.
for x, y, s_ in ((-1.5, -4.5, 0.4), (6.5, -0.2, 0.35), (-6.4, 4.5, 0.3), (6.5, 4.6, 0.3), (2.6, -4.5, 0.25)):
    cyl("pot", s_ * 0.5, s_ * 0.9, (x, y, s_ * 0.45), ceramic, r2=s_ * 0.38, segs=14)
    bush("plant", (x, y, s_ * 0.85), s_, plant)
# Kitchen counter and dining things.
for k in range(3):
    cyl("bowl", 0.1, 0.06, (3.0 + k * 0.25, -4.6, 0.97), ceramic, r2=0.06, segs=12)
cyl("kettle", 0.09, 0.22, (5.6, -4.65, 1.05), steel, segs=12)
box("cutting_board", (0.4, 0.28, 0.02), (4.3, -4.65, 0.95), oak)
cyl("fruit_bowl", 0.18, 0.08, (4.0, 0.3, 0.81), ceramic, r2=0.1, segs=14)
for k in range(5):
    sphere("fruit", 0.045, (4.0 + random.uniform(-0.08, 0.08), 0.3 + random.uniform(-0.08, 0.08), 0.87), random.choice(fruit), segs=8, rings=5)
for sx in (-0.45, 0.45):
    box("placemat", (0.4, 0.3, 0.005), (4.0 + sx, 0.0, 0.775), random.choice(art))
# Living room: cushions, throw, magazines, game console.
box("cushion", (0.45, 0.15, 0.4), (-3.4, -4.45, 0.62), art[1], bevel=0.05)
box("throw", (0.6, 0.85, 0.03), (-3.2, -4.3, 0.44), art[0])
box("magazine", (0.3, 0.22, 0.01), (-4.2, -2.75, 0.465), art[2], rot=(0, 0, 0.3))
box("console_box", (0.35, 0.3, 0.08), (-4.4, 1.2, 0.54), black)
box("soundbar", (0.9, 0.1, 0.07), (-4, 1.05, 0.54), black)
# Bedroom: rug, lamps on the nightstands, a laundry basket.
box("bed_rug", (2.2, 1.0, 0.01), (-5, 2.95, 0.025), art[3])
for sx in (-1, 1):
    cyl("bedside_lamp", 0.1, 0.25, (-5 + sx * 1.15, 4.75, 0.65), lamp_m, r2=0.07, segs=12)
cyl("basket", 0.2, 0.4, (-2.4, 4.6, 0.2), surf("wood_wicker", (0.7, 0.55, 0.35)), segs=12)
# Bathroom: toilet, mirror, towels.
box("toilet_base", (0.38, 0.55, 0.42), (2.55, 4.6, 0.21), white, bevel=0.05)
box("toilet_tank", (0.4, 0.18, 0.35), (2.55, 4.88, 0.6), white, bevel=0.03)
box("mirror", (0.6, 0.02, 0.7), (2.55, 2.78, 1.45), surf("metal_mirror", (0.9, 0.9, 0.92), metallic=1.0, rough=0.02))
box("towel", (0.5, 0.05, 0.6), (0.4, 4.92, 1.2), art[1])
# Office: keyboard, mug, desk lamp, a drone on the desk.
box("keyboard", (0.45, 0.15, 0.02), (5.2, 4.45, 0.78), black)
cyl("mug", 0.04, 0.1, (5.75, 4.4, 0.82), ceramic, segs=10)
cyl("desk_lamp", 0.07, 0.4, (4.6, 4.7, 0.97), steel, r2=0.02, segs=8)
box("drone_frame", (0.18, 0.18, 0.03), (5.5, 4.65, 0.79), black, rot=(0, 0, 0.78))
for k in range(4):
    a = k * math.pi / 2 + math.pi / 4
    cyl("drone_prop", 0.06, 0.005, (5.5 + math.cos(a) * 0.09, 4.65 + math.sin(a) * 0.09, 0.81), surf("plastic_prop", (1, 0.4, 0.05)), segs=10)
# Outside: patio, driveway with a car, hedges, a shed and a better neighbour house.
box("patio", (6, 4, 0.06), (0, -7.5, 0.03), surf("concrete_patio", (0.68, 0.66, 0.62)))
for k in range(2):
    parasol((-1.5 + k * 3, -7.6, 0.06), (0.95, 0.95, 0.9))
box("driveway", (4, 14, 0.04), (-10, 0, 0.02), surf("asphalt_drive", (0.2, 0.2, 0.21)))
car("car_drive", (-10, 1, 0.04), 0, (0.15, 0.3, 0.55))
for k in range(14):
    bush("hedge", (-14 + k * 2.0, -12, 0), 0.9, leaves)
box("shed", (3, 2.5, 2.2), (12, -10, 1.1), surf("wood_shed", (0.45, 0.3, 0.18)))
r_ = cyl("shed_roof", 2.4, 0.8, (12, -10, 2.6), surf("roof_tiles", (0.45, 0.2, 0.15), rough=0.8), r2=0.2, segs=4, smooth=False)
r_.rotation_euler = (0, 0, math.radians(45))
facade(0, 26, 12, 9, 6, 2.8, surf("paint_trim", (0.95, 0.95, 0.92)), surf("window_house", (0.25, 0.35, 0.45), rough=0.1, metallic=0.5), bay=2.4)
grass_tufts("lawn_tufts", (0, 0, 0), 30, 900, grass, avoid=[(-7.6, 7.6, -5.6, 5.6), (-3.2, 3.2, -9.6, -5.4), (-12.2, -7.8, -7.2, 7.2)])
for k in range(12):
    a = random.uniform(0, math.tau)
    bush("garden_bush", (13 * math.cos(a), 10 * math.sin(a), 0), random.uniform(0.5, 1.0))

# ---- Whoop hoops: radius 0.33 m on a stand. Race line: living -> kitchen -> hall -> back to living.
hoops = [(-5.0, -1.0, 0.8, -90), (1.0, -1.5, 1.2, -90), (5.6, -0.6, 1.0, 0), (4.0, 1.5, 1.0, 0), (0.0, 2.1, 1.2, 90), (-3.0, 1.5, 1.0, 180)]
for k, (x, y, z, yaw) in enumerate(hoops):
    r = ring("hoop", 0.31, 0.34, 0.035, (0, 0, 0), hoop_m, segs=32)
    r.rotation_euler = (math.radians(90), 0, math.radians(yaw))
    r.location = (x, y, z)
    if z - 0.34 > 0.05:
        # Stand pole only where it is out of the race line (hoops in door frames hang free).
        if k in (0, 2):
            cyl("hoop_stand", 0.012, z - 0.34, (x, y, (z - 0.34) / 2), steel, segs=6)
            cyl("hoop_base", 0.12, 0.02, (x, y, 0.01), steel, segs=12)
    empty("gate_%02d_marker" % (k + 1), (x, y, z), yaw)

# Garden outside the windows.
for _ in range(16):
    a = random.uniform(0, math.tau)
    d = random.uniform(11, 28)
    tree("tree", (d * math.cos(a), d * math.sin(a), 0), random.uniform(5, 9), "round", trunk, leaves)
box("neighbor_house", (12, 9, 6), (0, 26, 3), surf("brick_house", (0.6, 0.3, 0.22)))
for k in range(30):
    box("fence", (2.2, 0.06, 1.2), (-33 + k * 2.25, -20, 0.6), oak)

empty("spawn", (-5.5, -2.0, 0.03), -90)
print(finish_map("public/models/maps/house.glb"))
