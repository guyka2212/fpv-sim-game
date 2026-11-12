# Freestyle Hollywood: a palm-lined boulevard with a star-paved walk, a movie palace you can fly
# into (through the lobby and over the seats to the screen), a round records-style tower, a film
# studio lot with sound stages open at both ends, a backlot street of fake fronts and a water
# tower. Behind it the dry hills with the giant hillside sign, cliff houses on stilts with pools
# and a domed observatory on the ridge.
exec(open(r"C:\Users\User\Documents\fly-sim\blender\lib.py").read())
exec(open(r"C:\Users\User\Documents\fly-sim\blender\maplib.py").read())
exec(open(r"C:\Users\User\Documents\fly-sim\blender\detail.py").read())
from mathutils import noise
clear_scene()
random.seed(77)

asphalt = surf("asphalt_road", (0.12, 0.12, 0.13), rough=0.9)
sidewalk = surf("concrete_sidewalk", (0.66, 0.63, 0.58), rough=0.85)
kerb = surf("concrete_kerb", (0.72, 0.71, 0.68))
lot = surf("concrete_lot", (0.58, 0.57, 0.54))
chaparral = surf("dirt_chaparral", (0.52, 0.45, 0.32))
dry_grass = surf("grass_dry", (0.55, 0.5, 0.28))
hill_rock = surf("rock_hill", (0.55, 0.5, 0.42), rough=0.95)
lawn = surf("grass_lawn", (0.25, 0.48, 0.16))
stripe_w = surf("paint_road", (0.95, 0.95, 0.9), rough=0.6)
stripe_y = surf("paint_yellow", (0.95, 0.75, 0.1), rough=0.6)
star_tile = surf("stone_star_tile", (0.78, 0.45, 0.5), rough=0.3)
star_m = surf("metal_brass", (0.85, 0.65, 0.25), metallic=1.0, rough=0.25)
sign_white = surf("paint_sign_white", (0.95, 0.95, 0.93), rough=0.6)
scaffold = surf("metal_scaffold", (0.35, 0.35, 0.36), metallic=0.7, rough=0.5)
glass_b = surf("window_building", (0.3, 0.42, 0.5), rough=0.1, metallic=0.5)
facades = [surf("plaster_cream", (0.88, 0.8, 0.64)), surf("plaster_pink", (0.88, 0.66, 0.62)), surf("plaster_white", (0.92, 0.91, 0.88)),
           surf("plaster_teal", (0.45, 0.68, 0.66)), surf("brick_tan", (0.66, 0.5, 0.36)), surf("concrete_grey", (0.6, 0.6, 0.58))]
frames = [surf("concrete_frame", (0.88, 0.87, 0.84)), surf("metal_frame", (0.18, 0.19, 0.2), metallic=0.6, rough=0.4), surf("stone_frame", (0.78, 0.7, 0.58))]
theatre_m = surf("plaster_theatre", (0.86, 0.72, 0.5))
theatre_red = surf("plaster_theatre_red", (0.62, 0.1, 0.08))
gold = surf("metal_gold", (0.9, 0.7, 0.25), metallic=1.0, rough=0.25)
bulbs = surf("lamp_bulbs", (1.0, 0.9, 0.6), emission=(1.0, 0.85, 0.5), strength=4.0)
marquee = surf("sign_marquee", (1.0, 0.95, 0.85), emission=(1.0, 0.95, 0.85), strength=2.5)
blade_sign = surf("sign_blade", (1.0, 0.25, 0.2), emission=(1.0, 0.25, 0.15), strength=3.0)
screen_m = surf("screen_movie", (0.6, 0.75, 0.95), emission=(0.55, 0.7, 0.95), strength=1.6)
seat_m = surf("fabric_seat", (0.55, 0.05, 0.06), rough=0.9)
carpet = surf("carpet_red", (0.45, 0.05, 0.06))
dark = surf("metal_dark", (0.12, 0.12, 0.13), metallic=0.8, rough=0.4)
white = surf("paint_white", (0.92, 0.92, 0.9), rough=0.5)
stage_m = surf("plaster_stage", (0.86, 0.82, 0.72))
stage_door = surf("metal_stage_door", (0.55, 0.52, 0.48), metallic=0.5, rough=0.5)
tank_m = surf("metal_tank", (0.75, 0.76, 0.78), metallic=0.7, rough=0.35)
plank = surf("wood_planks", (0.55, 0.4, 0.26))
dome_m = surf("metal_dome", (0.22, 0.42, 0.38), metallic=0.7, rough=0.35)
obs_m = surf("plaster_observatory", (0.93, 0.92, 0.88))
pool = surf("water_pool", (0.15, 0.55, 0.7), rough=0.05)
billboard_cols = [(1.0, 0.3, 0.2), (0.2, 0.6, 1.0), (1.0, 0.8, 0.1), (0.9, 0.3, 0.9), (0.2, 0.9, 0.5)]
billboards = [surf("sign_billboard_%d" % i, c, emission=c, strength=1.4) for i, c in enumerate(billboard_cols)]
redlight = surf("lamp_beacon_red", (1.0, 0.05, 0.03), emission=(1.0, 0.05, 0.02), strength=4.0)


def smooth(t):
    t = min(1.0, max(0.0, t))
    return t * t * (3 - 2 * t)


X0, X1, Y0, Y1 = -450.0, 450.0, -330.0, 500.0
HILL_Y = 110.0
OBS = (210.0, 300.0, 55.0)   # observatory plateau centre and radius


def raw_height(x, y):
    n = noise.fractal(Vector((x / 160.0, y / 160.0, 0.7)), 0.55, 2.0, 4, noise_basis="PERLIN_ORIGINAL")
    t = smooth((y - HILL_Y) / 280)
    h = t * (95 + 40 * n) + 7 * n * smooth((y - HILL_Y) / 60)
    side = smooth((abs(x) - 300) / 140)
    h += side * (55 + 20 * n)
    # The map ends in ridges on every side.
    if y < -290:
        h += ((-y - 290) / 40) ** 2 * 60
    if y > 430:
        h += ((y - 430) / 70) ** 2 * 80
    if abs(x) > 400:
        h += ((abs(x) - 400) / 50) ** 2 * 60
    return max(0.0, h)


OBS_Z = raw_height(OBS[0], OBS[1]) + 2.0


def height(x, y):
    h = raw_height(x, y)
    w = smooth((OBS[2] + 25 - math.hypot(x - OBS[0], y - OBS[1])) / 25)
    return h * (1 - w) + OBS_Z * w


def pick(cx, cy, cz, nz):
    if cz < 0.3:
        return 0
    if nz < 0.62:
        return 3
    if math.hypot(cx - OBS[0], cy - OBS[1]) < OBS[2] - 4:
        return 4
    return 1 if noise.noise(Vector((cx / 40.0, cy / 40.0, 3.0))) > 0.1 else 2


terrain("terrain", X0, X1, Y0, Y1, 6.0, height, [lot, chaparral, dry_grass, hill_rock, lawn], pick)

# ---------------------------------------------------------------- streets
XS = [-240, -160, -80, 0, 80, 160, 240]
CITY_X = 300.0
BLVD_W, BLVD_WALK = 20.0, 6.0
SIDE_W, SIDE_WALK = 12.0, 3.0
STUDIO = (-249.0, -9.0, -280.0, -109.0)   # x0, x1, y0, y1 of the studio lot

box("blvd", (2 * CITY_X + 100, BLVD_W, 0.04), (0, 0, 0.02), asphalt)
for s in (-1, 1):
    box("blvd_line", (2 * CITY_X + 100, 0.15, 0.01), (0, s * 0.2, 0.045), stripe_y)
    for k in range(-34, 35):
        box("blvd_lane", (3, 0.15, 0.01), (k * 10, s * 5, 0.045), stripe_w)
    box("blvd_walk", (2 * CITY_X + 100, BLVD_WALK, 0.18), (0, s * (BLVD_W / 2 + BLVD_WALK / 2), 0.09), sidewalk)
    box("blvd_kerb", (2 * CITY_X + 100, 0.25, 0.2), (0, s * (BLVD_W / 2 + 0.12), 0.1), kerb)
box("street", (2 * CITY_X + 100, SIDE_W, 0.04), (0, -100, 0.021), asphalt)
for k in range(-34, 35):
    box("street_line", (3, 0.15, 0.01), (k * 10 + 5, -100, 0.046), stripe_w)
for x in XS:
    y_end = -100 if x in (-160, -80) else -290
    y_top = 100
    L = y_top - y_end
    box("street", (SIDE_W, L, 0.04), (x, (y_top + y_end) / 2, 0.022), asphalt)
    for k in range(int(L / 10)):
        box("street_line", (0.15, 3, 0.01), (x, y_end + 5 + k * 10, 0.047), stripe_w)

# Walk of fame: terrazzo squares with a brass star in each, both sides of the boulevard.
mesh = Mesher()
for s in (-1, 1):
    y = s * (BLVD_W / 2 + BLVD_WALK / 2)
    for k in range(-72, 73):
        x = k * 4.0 + 2
        if any(abs(x - sx) < 8 for sx in XS):
            continue
        mesh.cube(star_tile, (1.5, 1.5, 0.02), (x, y, 0.18))
        pts = [(x + math.cos(math.pi / 2 + i * math.tau / 5) * 0.55, y + math.sin(math.pi / 2 + i * math.tau / 5) * 0.55) for i in range(5)]
        for i in range(5):
            a, b = pts[i], pts[(i + 2) % 5]
            z = 0.196 + i * 0.002
            mesh.beam(star_m, (a[0], a[1], z), (b[0], b[1], z), 0.13, 0.008)
mesh.done("walk_of_fame")


def blocks():
    edges_x = [-CITY_X] + XS + [CITY_X]
    out = []
    for i in range(len(edges_x) - 1):
        xa = edges_x[i] + (SIDE_W / 2 + SIDE_WALK if edges_x[i] in XS else 0)
        xb = edges_x[i + 1] - (SIDE_W / 2 + SIDE_WALK if edges_x[i + 1] in XS else 0)
        out.append((xa, xb, BLVD_W / 2 + BLVD_WALK, 100.0, "north"))
        out.append((xa, xb, -100 + SIDE_W / 2 + SIDE_WALK, -(BLVD_W / 2 + BLVD_WALK), "mid"))
        out.append((xa, xb, -280.0, -100 - SIDE_W / 2 - SIDE_WALK, "south"))
    return out


# Sidewalks around every block (side streets).
for xa, xb, ya, yb, row in blocks():
    if row == "south" and xa < STUDIO[1] and xb > STUDIO[0]:
        continue
    box("block_walk", (xb - xa + 2 * SIDE_WALK, yb - ya + (SIDE_WALK if row != "north" else 0), 0.16), ((xa + xb) / 2, (ya + yb) / 2, 0.08), sidewalk)
box("studio_lot", (STUDIO[1] - STUDIO[0], STUDIO[3] - STUDIO[2], 0.1), ((STUDIO[0] + STUDIO[1]) / 2, (STUDIO[2] + STUDIO[3]) / 2, 0.05), lot)


def building(x, y, w, d, h, wall_m=None, front=None):
    wall_m = wall_m or random.choice(facades)
    box("building", (w, d, h), (x, y, h / 2), wall_m)
    facade(x, y, w, d, h, 3.4, random.choice(frames), glass_b, bay=random.choice([2.8, 3.4, 4.2]), base=4.0 if h > 9 else 0.0)
    if front is not None and h > 9:
        # Shop awning and lit sign on the street side.
        dx, dy = front
        if dx == 0:
            box("awning", (w * 0.8, 1.6, 0.12), (x, y + dy * (d / 2 + 0.8), 3.4), random.choice(frames))
            box("shop_sign", (w * 0.5, 0.15, 0.8), (x, y + dy * (d / 2 + 0.1), 4.4), random.choice(billboards))
        else:
            box("awning", (1.6, d * 0.8, 0.12), (x + dx * (w / 2 + 0.8), y, 3.4), random.choice(frames))
    rooftop_kit(x, y, w, d, h + 0.45)


def deco_tower(x, y, w, d, h):
    """Art deco tower in three setbacks with a lit crown."""
    wall_m = random.choice(facades[:3])
    z = 0.0
    for k, (s, hh) in enumerate(((1.0, h * 0.55), (0.78, h * 0.28), (0.56, h * 0.17))):
        ww, dd = w * s, d * s
        box("deco", (ww, dd, hh), (x, y, z + hh / 2), wall_m)
        facade(x, y, ww, dd, z + hh, 3.4, frames[2], glass_b, bay=2.4, base=z + (4.0 if k == 0 else 0.6))
        z += hh + 0.45
    cyl("deco_spire", 1.2, 12, (x, y, z + 6), gold, r2=0.1, segs=8, smooth=False)
    sphere("deco_beacon", 0.5, (x, y, z + 12.3), redlight)


special = {}
for xa, xb, ya, yb, row in blocks():
    cx, cy, bw, bd = (xa + xb) / 2, (ya + yb) / 2, xb - xa, yb - ya
    if row == "north" and xa < -1 and xb > -79:
        special["theatre"] = (cx, cy, bw, bd)
        continue
    if row == "north" and xa > 1 and xb < 79:
        special["tower"] = (cx, cy, bw, bd)
        continue
    if row == "south" and xa < STUDIO[1] and xb > STUDIO[0]:
        continue
    if row == "mid" and abs(cx - 120) < 30:
        # A parking lot with a big billboard instead of buildings.
        box("parking", (bw, bd, 0.06), (cx, cy, 0.19), asphalt)
        for k in range(10):
            for j in (-1, 1):
                if random.random() < 0.7:
                    car("lot_car", (cx - bw / 2 + 5 + k * 5.4, cy + j * 12, 0.22), 0, random.choice([(0.7, 0.05, 0.05), (0.05, 0.15, 0.5), (0.85, 0.85, 0.85), (0.1, 0.1, 0.1), (0.9, 0.6, 0.1)]))
        for sx in (-6, 6):
            box("billboard_leg", (0.8, 0.8, 16), (cx + sx, cy, 8), dark)
        box("billboard", (26, 0.6, 10), (cx, cy, 20), random.choice(billboards))
        box("billboard_back", (26.6, 0.4, 10.6), (cx, cy + 0.5, 20), dark)
        continue
    tall = row == "north"
    for side in range(4):
        horiz = side in (0, 2)
        length = bw if horiz else bd - 30
        if length < 8:
            continue
        along = -length / 2
        while along < length / 2 - 6:
            w = min(random.uniform(10, 20), length / 2 - along)
            if w < 7:
                break
            d = random.uniform(12, 16)
            h = random.choice([7, 9, 12, 15, 18, 24, 30, 40] if tall else [6, 8, 10, 12, 15, 18])
            mid = along + w / 2
            if side == 0:
                bx, by, ww, dd, fr = cx + mid, ya + d / 2, w, d, (0, -1)
            elif side == 2:
                bx, by, ww, dd, fr = cx - mid, yb - d / 2, w, d, (0, 1)
            elif side == 1:
                bx, by, ww, dd, fr = xb - d / 2, cy + mid, d, w, (1, 0)
            else:
                bx, by, ww, dd, fr = xa + d / 2, cy - mid, d, w, (-1, 0)
            if tall and h >= 30 and random.random() < 0.5:
                deco_tower(bx, by, ww - 0.6, dd, h * 1.5)
            else:
                building(bx, by, ww - 0.6, dd, h, front=fr)
            along += w + random.choice([0.0, 0.0, 4.0])
    for k in range(4):
        car("court_car", (cx + random.uniform(-bw / 4, bw / 4), cy + random.uniform(-6, 6), 0.18), random.choice([0, 90]),
            random.choice([(0.85, 0.85, 0.85), (0.1, 0.1, 0.1), (0.05, 0.15, 0.5), (0.7, 0.05, 0.05)]))

# ---------------------------------------------------------------- movie palace (fly in through the lobby)
tx, ty, tw, td = special["theatre"]
TW, TD, TH = 52.0, 60.0, 17.0
front_y = ty - td / 2 + 4
y0, y1 = front_y, front_y + TD
wall("theatre_front", (tx - TW / 2, y0), (tx + TW / 2, y0), 0, TH, 0.6, theatre_m, openings=((TW / 2, 14, 0, 9),))
wall("theatre_back", (tx - TW / 2, y1), (tx + TW / 2, y1), 0, TH, 0.6, theatre_m)
for sx in (-1, 1):
    wall("theatre_side", (tx + sx * (TW / 2 - 0.3), y0 + 0.3), (tx + sx * (TW / 2 - 0.3), y1 - 0.3), 0, TH, 0.6, theatre_m)
box("theatre_roof", (TW + 1.0, TD + 1.0, 0.8), (tx, (y0 + y1) / 2, TH + 0.4), theatre_red)
box("theatre_cornice", (TW + 2.0, 1.4, 1.2), (tx, y0 - 0.4, TH - 0.4), gold)
for cx_ in (-16.5, -12.5, -8.5, 8.5, 12.5, 16.5):
    box("theatre_column", (1.4, 1.0, 9), (tx + cx_, y0 - 0.8, 4.5), gold)
box("lobby_floor", (TW - 1.2, 18, 0.04), (tx, y0 + 9.3, 0.18), carpet)
box("lobby_ceiling", (TW - 1.2, 18, 0.4), (tx, y0 + 9.3, 9.2), theatre_red)
wall("lobby_wall", (tx - TW / 2 + 0.6, y0 + 18.5), (tx + TW / 2 - 0.6, y0 + 18.5), 0, 9.0, 0.4, theatre_m, openings=((TW / 2 - 0.6, 12, 0, 7.5),))
# Auditorium: seats rising toward the lobby, screen on the back wall.
for r in range(14):
    yy = y0 + 22 + r * 2.0
    zz = 0.2 + (13 - r) * 0.3
    box("aud_step", (TW - 6, 2.0, zz), (tx, yy, zz / 2), carpet)
    for sx in (-1, 1):
        box("aud_seats", (TW / 2 - 6, 0.7, 0.9), (tx + sx * (TW / 4), yy - 0.3, zz + 0.45), seat_m)
box("movie_screen", (34, 0.2, 9), (tx, y1 - 0.5, 8.5), screen_m)
for sx in (-1, 1):
    box("curtain", (4, 0.6, 14), (tx + sx * 19, y1 - 0.8, 7.2), theatre_red)
# Marquee canopy with chaser bulbs and the vertical blade sign.
mz = 9.8
box("marquee", (32, 7, 1.6), (tx, y0 - 3.6, mz), white)
box("marquee_sign", (30, 0.15, 1.2), (tx, y0 - 7.15, mz), marquee)
for sx in (-1, 1):
    box("marquee_sign", (0.15, 6, 1.2), (tx + sx * 16.05, y0 - 3.6, mz), marquee)
box("marquee_bulbs", (32.4, 7.4, 0.15), (tx, y0 - 3.6, mz - 0.85), bulbs)
box("blade_sign", (2.4, 5.0, 18), (tx, y0 - 2.6, TH + 6), theatre_red)
for sx in (-1, 1):
    box("blade_sign_face", (0.15, 4.4, 16.5), (tx + sx * 1.28, y0 - 2.6, TH + 6), blade_sign)
box("blade_bulbs", (2.8, 5.4, 0.3), (tx, y0 - 2.6, TH + 15.2), bulbs)

# ---------------------------------------------------------------- round records-style tower
rx_, ry_, _, _ = special["tower"]
box("tower_podium", (40, 40, 5), (rx_, ry_ + 6, 2.5), facades[2])
facade(rx_, ry_ + 6, 40, 40, 5, 4.5, frames[1], glass_b, bay=4.0)
FLOORS = 13
for k in range(FLOORS):
    z = 5.5 + k * 3.6
    cyl("tower_glass", 10.6, 3.6, (rx_, ry_ + 6, z + 1.8), glass_b, segs=28)
    cyl("tower_slab", 12.0, 0.5, (rx_, ry_ + 6, z + 3.55), white, segs=28)
    for f in range(14):
        a = f * math.tau / 14
        box("tower_fin", (1.6, 0.2, 3.1), (rx_ + math.cos(a) * 11.3, ry_ + 6 + math.sin(a) * 11.3, z + 1.8), white, rot=(0, 0, a))
ztop = 5.5 + FLOORS * 3.6
cyl("tower_cap", 8.0, 3.0, (rx_, ry_ + 6, ztop + 1.5), white, segs=24)
cyl("tower_needle", 0.35, 28, (rx_, ry_ + 6, ztop + 17), white, r2=0.12, segs=8)
sphere("tower_beacon", 0.6, (rx_, ry_ + 6, ztop + 31.3), redlight)

# ---------------------------------------------------------------- film studio lot
sx0, sx1, sy0, sy1 = STUDIO
for k in range(int((sx1 - sx0) / 3)):
    x = sx0 + 1.5 + k * 3
    if abs(x + 120) > 9:
        box("studio_fence", (3.0, 0.2, 2.6), (x, sy1 - 0.4, 1.3), white)
for y in range(int(sy0), int(sy1), 3):
    for x in (sx0 + 0.3, sx1 - 0.3):
        box("studio_fence", (0.2, 3.0, 2.6), (x, y + 1.5, 1.3), white)
# Gate arch on the street, with a lit sign.
for s in (-1, 1):
    box("gate_pillar", (2.4, 2.4, 11), (-120 + s * 9.5, sy1 + 1, 5.5), stage_m)
box("gate_beam", (22, 2.4, 2.4), (-120, sy1 + 1, 12.2), stage_m)
box("gate_sign", (16, 0.2, 1.6), (-120, sy1 - 0.25, 12.2), marquee)
# Sound stages: 2 x 2, the two front ones open at both ends to fly through.
for i, x in enumerate((-215, -155)):
    for j, y in enumerate((-142, -232)):
        W, D, H = 44.0, 64.0, 18.0
        open_ends = j == 0
        for sgn in (-1, 1):
            wall("stage_side", (x + sgn * W / 2, y - D / 2), (x + sgn * W / 2, y + D / 2), 0, H, 0.6, stage_m)
            ops = ((W / 2, 16, 0, 13),) if open_ends else ()
            wall("stage_end", (x - W / 2 - 0.3, y + sgn * D / 2), (x + W / 2 + 0.3, y + sgn * D / 2), 0, H, 0.6, stage_m, openings=ops)
            if not open_ends:
                box("stage_door", (14, 0.2, 12), (x, y + sgn * (D / 2 + 0.4), 6), stage_door)
        box("stage_roof", (W + 1.4, D + 1.4, 0.8), (x, y, H + 0.4), stage_m)
        for k in range(5):
            rooftop_kit(x - 14 + k * 7, y + random.uniform(-20, 20), 4, 4, H + 0.8)
        box("stage_number", (0.2, 8, 8), (x + W / 2 + 0.4, y, H - 6), dark)
        if open_ends:
            # A film set inside: a lit backdrop, light rigs on a truss grid and a camera crane.
            box("set_backdrop", (30, 0.3, 10), (x, y + 12, 5.2), billboards[(i + 1) % len(billboards)])
            for k in range(4):
                mesh.beam(scaffold, (x - 18, y - 24 + k * 16, 14), (x + 18, y - 24 + k * 16, 14), 0.5)
            for k in range(-1, 2):
                mesh.beam(scaffold, (x + k * 12, y - 26, 14.2), (x + k * 12, y + 26, 14.2), 0.5)
            mesh.done("stage_truss")
            cyl("crane_base", 1.4, 1.2, (x - 8, y - 6, 0.6), dark, segs=12)
            box("crane_arm", (0.5, 12, 0.5), (x - 8, y - 2, 4.2), dark, rot=(math.radians(-25), 0, 0))
# Water tower.
wx, wy = -40.0, -235.0
for a in range(4):
    ang = a * math.tau / 4 + math.pi / 4
    mesh.beam(scaffold, (wx + math.cos(ang) * 5.5, wy + math.sin(ang) * 5.5, 0), (wx + math.cos(ang) * 3.6, wy + math.sin(ang) * 3.6, 22), 0.45)
for z in (7, 14):
    for a in range(4):
        a0, a1 = a * math.tau / 4 + math.pi / 4, (a + 1) * math.tau / 4 + math.pi / 4
        r = 5.5 - 1.9 * z / 22
        mesh.beam(scaffold, (wx + math.cos(a0) * r, wy + math.sin(a0) * r, z), (wx + math.cos(a1) * r, wy + math.sin(a1) * r, z), 0.3)
mesh.done("water_tower_legs")
cyl("water_tower_floor", 5.4, 0.4, (wx, wy, 22.2), dark, segs=20)
cyl("water_tower_tank", 5.0, 7.0, (wx, wy, 25.9), tank_m, segs=24)
cyl("water_tower_roof", 5.3, 2.4, (wx, wy, 30.6), tank_m, r2=0.3, segs=24, smooth=False)
ring("water_tower_rail", 5.3, 5.4, 1.0, (wx, wy, 22.9), dark, segs=24)
# Backlot street: false fronts held up by braces.
for k in range(7):
    for sgn in (-1, 1):
        fx = -118 + k * 14
        fy = -170 + sgn * 11
        h = random.choice([9, 11, 13, 15])
        box("false_front", (12, 0.4, h), (fx, fy, h / 2), random.choice(facades))
        facade(fx, fy, 12, 0.4, h, 3.4, random.choice(frames), glass_b, bay=3.0, sides=(2,) if sgn < 0 else (0,))
        for bxo in (-4, 4):
            mesh.beam(plank, (fx + bxo, fy + sgn * 0.3, h - 1.0), (fx + bxo, fy + sgn * 6.0, 0.1), 0.25)
            mesh.beam(plank, (fx + bxo, fy + sgn * 0.3, 0.4), (fx + bxo, fy + sgn * 6.0, 0.4), 0.2)
mesh.done("backlot_braces")
for k, (x, y) in enumerate(((-110, -260), (-100, -200), (-30, -130), (-60, -275))):
    truck((x, y, 0.1), 90, billboard_cols[k % len(billboard_cols)])

# ---------------------------------------------------------------- palms, lamps, street life
for s in (-1, 1):
    y = s * (BLVD_W / 2 + 1.6)
    for k in range(-18, 19):
        x = k * 16 + 8
        if any(abs(x - sx) < 10 for sx in XS):
            continue
        palm_tree("blvd_palm", (x, y, 0.18), random.uniform(18, 25), lean=random.uniform(0.0, 0.06))
    for k in range(-14, 15):
        x = k * 20
        if not any(abs(x - sx) < 8 for sx in XS):
            street_lamp((x, s * (BLVD_W / 2 + 0.6), 0.18), 90 if s < 0 else -90, h=7.0)
for x in XS:
    for k in range(9):
        y = 92 - k * 24 if x not in (-160, -80) else 92 - k * 12
        if y < -95 and x in (-160, -80):
            break
        if abs(y) < 20 or abs(y + 100) < 12:
            continue
        palm_tree("side_palm", (x + SIDE_W / 2 + 1.4, y, 0.16), random.uniform(16, 22), lean=random.uniform(0.0, 0.08))
car_cols = [(0.85, 0.85, 0.85), (0.1, 0.1, 0.1), (0.7, 0.05, 0.05), (0.05, 0.15, 0.5), (0.95, 0.75, 0.1), (0.3, 0.55, 0.75)]
for k in range(-30, 31):
    if random.random() < 0.35 and not any(abs(k * 10 - sx) < 9 for sx in XS):
        car("blvd_car", (k * 10, random.choice((-1, 1)) * 7.6, 0.04), random.choice((90, -90)), random.choice(car_cols))
for k in range(12):
    x = random.uniform(-280, 280)
    s = random.choice((-1, 1))
    if not any(abs(x - sx) < 10 for sx in XS):
        bench((x, s * (BLVD_W / 2 + BLVD_WALK - 1.0), 0.18), 0 if s > 0 else 180)
# Rooftop billboards along the boulevard.
for k, x in enumerate((-200, -120, 120, 200)):
    yb = 40
    box("roof_billboard_leg", (0.6, 0.6, 30), (x - 7, yb, 15), dark)
    box("roof_billboard_leg", (0.6, 0.6, 30), (x + 7, yb, 15), dark)
    box("roof_billboard", (20, 0.5, 8), (x, yb, 30), billboards[k % len(billboards)])

# ---------------------------------------------------------------- hillside sign
FONT = {
    "H": [((0, 0), (0, 1)), ((1, 0), (1, 1)), ((0, 0.5), (1, 0.5))],
    "O": [((0.3, 0), (0.7, 0)), ((0.7, 0), (1, 0.25)), ((1, 0.25), (1, 0.75)), ((1, 0.75), (0.7, 1)),
          ((0.7, 1), (0.3, 1)), ((0.3, 1), (0, 0.75)), ((0, 0.75), (0, 0.25)), ((0, 0.25), (0.3, 0))],
    "L": [((0, 0), (0, 1)), ((0, 0), (0.85, 0))],
    "Y": [((0.5, 0), (0.5, 0.5)), ((0.5, 0.5), (0, 1)), ((0.5, 0.5), (1, 1))],
    "W": [((0, 1), (0.22, 0)), ((0.22, 0), (0.5, 0.65)), ((0.5, 0.65), (0.78, 0)), ((0.78, 0), (1, 1))],
    "D": [((0, 0), (0, 1)), ((0, 1), (0.6, 1)), ((0.6, 1), (1, 0.7)), ((1, 0.7), (1, 0.3)), ((1, 0.3), (0.6, 0)), ((0.6, 0), (0, 0))],
}
SIGN_Y = 255.0
LW, LH, LT, GAP = 10.0, 15.0, 1.9, 5.0
text = "HOLLYWOOD"
x = -(len(text) * LW + (len(text) - 1) * GAP) / 2
for li, ch in enumerate(text):
    xc = x + LW / 2
    z0 = max(height(xc + dx, SIGN_Y - 1) for dx in (-LW / 2, 0, LW / 2)) + 0.6
    for si, ((u0, v0), (u1, v1)) in enumerate(FONT[ch]):
        ax, az = x + u0 * LW, z0 + v0 * LH
        bx, bz = x + u1 * LW, z0 + v1 * LH
        L = math.hypot(bx - ax, bz - az)
        ext = LT / 2 + 0.015 * si
        # Each stroke a little deeper than the last, so no two front faces share a plane.
        box("sign_%s" % ch, (L + 2 * ext, 0.7 + 0.05 * si, LT), ((ax + bx) / 2, SIGN_Y, (az + bz) / 2), sign_white,
            rot=(0, -math.atan2(bz - az, bx - ax), 0))
    # Scaffold behind the letter down to the slope.
    for u in (0.15, 0.5, 0.85):
        px = x + u * LW
        top = z0 + LH * 0.92
        gz = height(px, SIGN_Y + 4.0)
        mesh.beam(scaffold, (px, SIGN_Y + 0.7, top), (px, SIGN_Y + 0.7, height(px, SIGN_Y + 0.7) - 0.3), 0.3)
        mesh.beam(scaffold, (px, SIGN_Y + 0.7, top), (px, SIGN_Y + 4.0, gz - 0.3), 0.25)
    for v in (0.3, 0.7):
        mesh.beam(scaffold, (x, SIGN_Y + 0.8, z0 + v * LH), (x + LW, SIGN_Y + 0.8, z0 + v * LH), 0.2)
    x += LW + GAP
mesh.done("sign_scaffold")

# ---------------------------------------------------------------- cliff houses on stilts with pools


def stilt_house(x, y):
    zb = height(x, y + 9) + 0.2
    W, D = random.uniform(16, 22), 10.0
    col = random.choice(facades[:4])
    box("house", (W, D, 3.6), (x, y, zb + 1.8), col)
    box("house_glass", (W - 1.0, 0.1, 3.0), (x, y - D / 2 - 0.05, zb + 1.8), glass_b)
    box("house_roof", (W + 2, D + 3, 0.35), (x, y - 1.0, zb + 3.8), white)
    box("house_upper", (W * 0.6, D * 0.8, 3.2), (x + W * 0.15, y + 1.0, zb + 5.6), col)
    box("house_upper_glass", (W * 0.6 - 1.0, 0.1, 2.6), (x + W * 0.15, y + 1.0 - D * 0.4 - 0.05, zb + 5.6), glass_b)
    box("house_upper_roof", (W * 0.6 + 1.6, D * 0.8 + 2, 0.3), (x + W * 0.15, y + 0.6, zb + 7.35), white)
    # Deck and pool cantilevered out over the slope.
    box("house_deck", (W, 8, 0.4), (x, y - D / 2 - 4, zb - 0.2), plank)
    box("pool_rim", (W * 0.6, 4.6, 0.5), (x - W * 0.15, y - D / 2 - 4.5, zb + 0.25), white)
    box("pool", (W * 0.6 - 0.8, 3.8, 0.1), (x - W * 0.15, y - D / 2 - 4.5, zb + 0.46), pool)
    railing((x - W / 2, y - D / 2 - 7.9), (x + W / 2, y - D / 2 - 7.9), zb, material=dark)
    for sx in (-W / 2 + 0.6, 0, W / 2 - 0.6):
        for yy in (y - D / 2 - 7.5, y - D / 2 - 1.5, y + D / 2 - 0.5):
            g = height(x + sx, yy)
            if g < zb - 0.6:
                cyl("stilt", 0.25, zb - g, (x + sx, yy, (zb + g) / 2), white, segs=10)
    parasol((x + W * 0.3, y - D / 2 - 4, zb), random.choice(billboard_cols))


houses = []
tries = 0
while len(houses) < 12 and tries < 400:
    tries += 1
    x, y = random.uniform(-270, 270), random.uniform(150, 225)
    if abs(x) < 95 and y > 215:
        continue
    if any(math.hypot(x - hx, y - hy) < 34 for hx, hy in houses):
        continue
    h = height(x, y)
    if h < 8:
        continue
    houses.append((x, y))
    stilt_house(x, y)

# ---------------------------------------------------------------- observatory on the ridge
ox, oy, _ = OBS
oz = OBS_Z
box("obs_terrace", (80, 34, 1.2), (ox, oy, oz - 0.4), lot)
box("obs_hall", (60, 16, 10), (ox, oy + 4, oz + 5), obs_m)
facade(ox, oy + 4, 60, 16, 10, 5.0, frames[0], glass_b, bay=5.0, sides=(0,))
box("obs_center", (22, 22, 12), (ox, oy + 4, oz + 6), obs_m)
cyl("obs_drum", 10, 3, (ox, oy + 4, oz + 13.5), obs_m, segs=32)
sphere("obs_dome", 10.2, (ox, oy + 4, oz + 15), dome_m, scale=(1, 1, 0.95), segs=32, rings=16)
for s in (-1, 1):
    cyl("obs_tower", 5, 6, (ox + s * 30, oy + 4, oz + 13), obs_m, segs=24)
    sphere("obs_small_dome", 5.2, (ox + s * 30, oy + 4, oz + 16), dome_m, segs=24, rings=12)
box("obelisk", (2.4, 2.4, 14), (ox, oy - 26, oz + 7), obs_m)
cyl("obelisk_tip", 1.7, 2.4, (ox, oy - 26, oz + 15.2), obs_m, r2=0.05, segs=4, smooth=False).rotation_euler = (0, 0, math.radians(45))
box("obs_lawn", (70, 18, 0.1), (ox, oy - 26, oz + 0.05), lawn)
railing((ox - 40, oy - 36), (ox + 40, oy - 36), oz, material=dark)

# ---------------------------------------------------------------- chaparral on the hills


def free(x, y):
    if abs(x) < 90 and abs(y - SIGN_Y) < 14:
        return False
    if math.hypot(x - OBS[0], y - OBS[1]) < OBS[2] + 4:
        return False
    return all(math.hypot(x - hx, y - hy) > 16 for hx, hy in houses)


dry = surf("leaves_chaparral", (0.3, 0.33, 0.16))
for _ in range(900):
    x, y = random.uniform(-440, 440), random.uniform(-300, 480)
    z = height(x, y)
    if z > 3 and free(x, y):
        bush("chaparral", (x, y, z - 0.2), random.uniform(0.8, 2.0), dry)
for _ in range(120):
    x, y = random.uniform(-420, 420), random.uniform(HILL_Y + 20, 460)
    z = height(x, y)
    if z > 5 and free(x, y):
        if random.random() < 0.4:
            palm_tree("hill_palm", (x, y, z - 0.2), random.uniform(14, 20))
        else:
            leafy_tree("oak", (x, y, z - 0.3), random.uniform(6, 10), leaf=dry)

empty("spawn", (0, -3.5, 0.1), 0)
print(finish_map("public/models/maps/hollywood.glb"))
