# Freestyle stadium: a football stadium bowl. Two tiers of seating with an open slot between
# them you can fly through and out under the upper tier, open corners, a ring roof on cantilever
# trusses with a gap above the top row, floodlights along its edge, giant screens behind the goals,
# a striped pitch with goals, and plazas and car parks outside.
exec(open(r"C:\Users\User\Documents\fly-sim\blender\lib.py").read())
exec(open(r"C:\Users\User\Documents\fly-sim\blender\maplib.py").read())
exec(open(r"C:\Users\User\Documents\fly-sim\blender\detail.py").read())
clear_scene()
random.seed(90)

plaza = surf("concrete_plaza", (0.66, 0.65, 0.62))
asphalt = surf("asphalt_lot", (0.13, 0.13, 0.14), rough=0.9)
grass_a = surf("grass_pitch_a", (0.2, 0.5, 0.14))
grass_b = surf("grass_pitch_b", (0.16, 0.42, 0.11))
surround = surf("grass_surround", (0.15, 0.36, 0.1))
line_m = surf("paint_line", (0.96, 0.96, 0.94), rough=0.6)
conc = surf("concrete_stand", (0.62, 0.62, 0.6))
seat_low = surf("plastic_seat_red", (0.72, 0.07, 0.08), rough=0.5)
seat_up = surf("plastic_seat_blue", (0.07, 0.2, 0.6), rough=0.5)
seat_white = surf("plastic_seat_white", (0.9, 0.9, 0.9), rough=0.5)
steel = surf("metal_steel", (0.8, 0.81, 0.83), metallic=0.8, rough=0.3)
roof_m = surf("metal_roof", (0.88, 0.89, 0.9), metallic=0.4, rough=0.45)
flood = surf("lamp_flood", (1.0, 1.0, 0.95), emission=(1.0, 0.98, 0.9), strength=6.0)
screen = surf("screen_led", (0.1, 0.4, 0.9), emission=(0.2, 0.55, 1.0), strength=2.5)
ads = [surf("sign_ads_%d" % i, c, emission=c, strength=1.8) for i, c in enumerate([(0.1, 0.8, 1.0), (1.0, 0.3, 0.1), (0.2, 1.0, 0.4), (1.0, 0.85, 0.1)])]
white = surf("paint_white", (0.95, 0.95, 0.93), rough=0.5)
dark = surf("metal_dark", (0.12, 0.12, 0.13), metallic=0.8, rough=0.4)
glass = surf("glass_dugout", (0.6, 0.7, 0.75), rough=0.05, alpha=0.4)
stripe = surf("paint_lines", (0.92, 0.92, 0.88), rough=0.6)

HX, HY, R = 60.0, 42.0, 16.0          # rounded rectangle the stands are measured from
FX, FY = 52.5, 34.0                   # pitch half length / half width

box("ground", (700, 700, 0.2), (0, 0, -0.1), plaza)
box("surround", (2 * HX + 8, 2 * HY + 8, 0.04), (0, 0, 0.02), surround)
for k in range(12):
    x = -FX + (k + 0.5) * (2 * FX / 12)
    box("pitch", (2 * FX / 12, 2 * FY, 0.03), (x, 0, 0.055), grass_a if k % 2 else grass_b)
# Markings.
mesh = Mesher()
LZ, LW = 0.075, 0.12


def line(a, b):
    mesh.beam(line_m, (a[0], a[1], LZ), (b[0], b[1], LZ), LW, 0.01, ext=LW / 2)


for s in (-1, 1):
    line((-FX, s * FY), (FX, s * FY))
    line((s * FX, -FY), (s * FX, FY))
    # Penalty box, goal box and arc.
    line((s * FX, -20.16), (s * (FX - 16.5), -20.16))
    line((s * FX, 20.16), (s * (FX - 16.5), 20.16))
    line((s * (FX - 16.5), -20.16), (s * (FX - 16.5), 20.16))
    line((s * FX, -9.16), (s * (FX - 5.5), -9.16))
    line((s * FX, 9.16), (s * (FX - 5.5), 9.16))
    line((s * (FX - 5.5), -9.16), (s * (FX - 5.5), 9.16))
    mesh.cube(line_m, (0.3, 0.3, 0.01), (s * (FX - 11), 0, LZ))
    for k in range(10):
        a0 = math.radians(-53 + k * 10.6)
        a1 = math.radians(-53 + (k + 1) * 10.6)
        p0 = (s * (FX - 11 - 9.15 * math.cos(a0)), 9.15 * math.sin(a0))
        p1 = (s * (FX - 11 - 9.15 * math.cos(a1)), 9.15 * math.sin(a1))
        line(p0, p1)
line((0, -FY), (0, FY))
for k in range(36):
    a0, a1 = k * math.tau / 36, (k + 1) * math.tau / 36
    line((9.15 * math.cos(a0), 9.15 * math.sin(a0)), (9.15 * math.cos(a1), 9.15 * math.sin(a1)))
mesh.cube(line_m, (0.3, 0.3, 0.01), (0, 0, LZ))
mesh.done("markings")

# Goals with nets.
for s in (-1, 1):
    gx = s * FX
    for y in (-3.66, 3.66):
        cyl("goal_post", 0.06, 2.44, (gx, y, 0.07 + 1.22), white, segs=10)
        mesh.beam(white, (gx + s * 2.0, y, 0.07), (gx + s * 2.0, y, 1.6), 0.05)
        mesh.beam(white, (gx, y, 2.5), (gx + s * 2.0, y, 1.6), 0.05)
    cyl("goal_bar", 0.06, 7.44, (gx, 0, 2.51), white, rot=(math.radians(90), 0, 0), segs=10)
    mesh.beam(white, (gx + s * 2.0, -3.66, 1.6), (gx + s * 2.0, 3.66, 1.6), 0.05)
    for k in range(13):
        y = -3.66 + k * 7.32 / 12
        mesh.beam(stripe, (gx, y, 2.5), (gx + s * 2.0, y, 1.6), 0.02)
        mesh.beam(stripe, (gx + s * 2.0, y, 1.6), (gx + s * 2.0, y, 0.07), 0.02)
    for k in range(1, 8):
        z = k * 2.44 / 8
        mesh.beam(stripe, (gx + s * 2.0, -3.66, z * 1.6 / 2.44), (gx + s * 2.0, 3.66, z * 1.6 / 2.44), 0.02)
mesh.done("goals")

# Dugouts and corner flags.
for s in (-1, 1):
    x = s * 9
    box("dugout", (7, 2.4, 0.15), (x, -HY + 1.0, 2.2), glass, rot=(math.radians(10), 0, 0))
    box("dugout_back", (7, 0.2, 2.2), (x, -HY + 2.2, 1.1), dark)
    box("dugout_bench", (6.6, 0.6, 0.45), (x, -HY + 1.7, 0.27), seat_low)
for sx in (-1, 1):
    for sy in (-1, 1):
        flag((sx * FX, sy * FY, 0.07), (1.0, 0.85, 0.1), h=1.5)

# ---------------------------------------------------------------- stands
path = rounded_rect(HX, HY, R, step=4.0, arc_steps=10)
mids = [i for i, (x, y, nx, ny) in enumerate(path) if abs(abs(nx) - abs(ny)) < 0.05]


def sections():
    """Path split into four sides, with a gap at the middle of each corner (open corners)."""
    out = []
    n = len(path)
    for k in range(4):
        a, b = mids[k] + 1, mids[(k + 1) % 4] - 1
        idx = []
        i = a
        while True:
            idx.append(i % n)
            if i % n == b % n:
                break
            i += 1
        out.append([path[i] for i in idx])
    return out


def stepped(d0, z0, rows, tread, rise, back_d, back_z, under=None):
    """Stepped seating profile; under: closing points along the bottom."""
    prof = [(d0, z0)]
    d, z = d0, z0 + rise * 1.6
    prof.append((d, z))
    for k in range(rows):
        d += tread
        prof.append((d, z))
        z += rise
        prof.append((d, z))
    prof.append((back_d, z))
    prof += under(d, z) if under else [(back_d, back_z)]
    return prof


low = stepped(6.0, 0.0, 26, 0.85, 0.42, 34.0, 0.0)


def tread_or_riser(prof, seat_idx):
    def f(j):
        if j < 0:
            return 0
        # Treads and the risers between rows are seats (their backs face the pitch).
        return seat_idx if 1 <= j < len(prof) - 3 else 0
    return f


up = stepped(33.0, 17.0, 24, 0.85, 0.6, 54.4, 0.0, under=lambda d, z: [(54.4, z - 2.0)])
for k, sec in enumerate(sections()):
    sweep("stand_lower", sec, low, [conc, seat_low], mat_of=tread_or_riser(low, 1), closed=False)
    sweep("stand_upper", sec, up, [conc, seat_up], mat_of=tread_or_riser(up, 1), closed=False)
    # Advertising boards around the pitch.
    board = [(2.8, 0.0), (3.1, 0.0), (3.1, 1.0), (2.8, 1.0)]
    sweep("ad_board", sec, board, [ads[k]], closed=False)
    # Columns under the upper tier: one row mid-way, one at the back.
    for i, (x, y, nx, ny) in enumerate(sec):
        if i % 3 == 1:
            under_z = 17.0 + (40.0 - 33.0) * ((up[-1][1] - 17.0) / (54.4 - 33.0))
            mesh.beam(conc, (x + nx * 40, y + ny * 40, 0), (x + nx * 40, y + ny * 40, under_z), 1.0)
            mesh.beam(conc, (x + nx * 53, y + ny * 53, 0), (x + nx * 53, y + ny * 53, up[-1][1]), 1.2)
mesh.done("stand_columns")

# Ring roof on cantilever trusses: a slot open to the sky between the top row and the roof.
roof = [(19.0, 44.0), (19.0, 44.6), (62.0, 47.0), (62.0, 46.2)]
sweep("roof", path, roof, [roof_m])
sweep("floodlights", path, [(19.4, 43.75), (21.0, 43.85), (21.0, 44.05), (19.4, 43.95)], [flood])
for i, (x, y, nx, ny) in enumerate(path):
    if i % 3:
        continue
    p = lambda d, z: (x + nx * d, y + ny * d, z)
    mesh.beam(steel, p(60, 0), p(60, 48.5), 1.1)
    mesh.beam(steel, p(60, 48.5), p(19.5, 45.6), 0.5)
    mesh.beam(steel, p(60, 36), p(32, 44.4), 0.45)
mesh.done("roof_trusses")
# Giant screens behind the goals, hung from the roof.
for s in (-1, 1):
    x = s * (HX + 23)
    box("screen_frame", (1.0, 26, 11), (x, 0, 37), dark)
    box("big_screen", (0.1, 25, 10), (x - s * 0.55, 0, 37), screen)
    for y in (-10, 10):
        mesh.beam(steel, (x, y, 42.5), (x, y, 45.5), 0.12)
mesh.done("screen_cables")

# ---------------------------------------------------------------- outside: plazas, car parks, trees
for s in (-1, 1):
    y0 = s * 140
    box("car_park", (220, 70, 0.04), (0, y0, 0.02), asphalt)
    for k in range(-20, 21):
        box("bay_line", (0.12, 5, 0.01), (k * 5.0, y0 - 9, 0.045), stripe)
        box("bay_line", (0.12, 5, 0.01), (k * 5.0, y0 + 9, 0.045), stripe)
        for row in (-9, 9):
            if random.random() < 0.55 and k < 20:
                car("park_car", (k * 5.0 + 2.5, y0 + row, 0.04), 0 if row > 0 else 180,
                    random.choice([(0.85, 0.85, 0.85), (0.1, 0.1, 0.1), (0.7, 0.05, 0.05), (0.05, 0.15, 0.5), (0.3, 0.3, 0.32)]))
    for k in range(-4, 5):
        street_lamp((k * 25.0, y0, 0.04), 90, h=10)
        street_lamp((k * 25.0, y0, 0.04), -90, h=10)
for k in range(56):
    a = k * math.tau / 56
    rx_, ry_ = (HX + 95) * math.cos(a), (HY + 85) * math.sin(a)
    if abs(ry_) > 95 and abs(rx_) < 115:
        continue
    tree("plaza_tree", (rx_, ry_, 0), random.uniform(7, 11), "round")
for k in range(12):
    a = k * math.tau / 12 + 0.13
    if abs((HY + 80) * math.sin(a)) > 95:
        continue
    flag(((HX + 90) * math.cos(a), (HY + 80) * math.sin(a), 0), [(0.72, 0.07, 0.08), (0.07, 0.2, 0.6), (0.95, 0.95, 0.93)][k % 3], h=12)
# Ticket booths at the corner entrances.
for i in mids:
    x, y, nx, ny = path[i]
    bx_, by_ = x + nx * 70, y + ny * 70
    box("ticket_booth", (4, 4, 3), (bx_, by_, 1.5), white)
    box("ticket_roof", (5, 5, 0.3), (bx_, by_, 3.15), seat_up)

empty("spawn", (0, -20, 0.1), -90)
print(finish_map("public/models/maps/stadium.glb"))
