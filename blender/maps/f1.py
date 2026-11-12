# Grand Prix circuit: 2.4 km road course with kerbs, gravel traps, armco, a pit lane and garages,
# grandstands, a start gantry and an advertising bridge. Race cars lap it in the game along the
# exported driving line (f1.track.json).
exec(open(r"C:\Users\User\Documents\fly-sim\blender\lib.py").read())
exec(open(r"C:\Users\User\Documents\fly-sim\blender\maplib.py").read())
exec(open(r"C:\Users\User\Documents\fly-sim\blender\detail.py").read())
exec(open(r"C:\Users\User\Documents\fly-sim\blender\tracklib.py").read())
clear_scene()
random.seed(44)

grass = surf("grass_infield", (0.2, 0.45, 0.13))
asphalt = surf("asphalt_track", (0.1, 0.1, 0.11), rough=0.85)
runoff = surf("asphalt_runoff", (0.2, 0.2, 0.21), rough=0.9)
gravel = surf("dirt_gravel", (0.62, 0.55, 0.42))
kerb_r = surf("paint_kerb_red", (0.85, 0.05, 0.05), rough=0.6)
kerb_w = surf("paint_kerb_white", (0.92, 0.92, 0.9), rough=0.6)
line_w = surf("paint_line", (0.95, 0.95, 0.92), rough=0.6)
armco = surf("metal_armco", (0.7, 0.72, 0.74), metallic=0.85, rough=0.35)
concrete = surf("concrete_wall", (0.75, 0.74, 0.72))
steel = surf("metal_steel", (0.5, 0.52, 0.55), metallic=0.9, rough=0.35)
dark = surf("metal_dark", (0.08, 0.08, 0.09), metallic=0.6, rough=0.5)
glass = surf("window_building", (0.2, 0.3, 0.4), rough=0.08, metallic=0.5)
seat_cols = [surf("plastic_seat_red", (0.75, 0.06, 0.06), rough=0.6), surf("plastic_seat_blue", (0.06, 0.2, 0.7), rough=0.6),
             surf("plastic_seat_grey", (0.5, 0.5, 0.52), rough=0.6)]
team_cols = [surf("paint_team_%d" % i, c, rough=0.4) for i, c in enumerate(
    [(0.8, 0.05, 0.05), (0.05, 0.1, 0.35), (0.0, 0.55, 0.5), (1.0, 0.45, 0.0), (0.0, 0.35, 0.15), (0.9, 0.9, 0.9), (0.1, 0.3, 0.9), (0.6, 0.6, 0.62)])]
boards = [surf("sign_board_%d" % i, c, emission=c, strength=1.5) for i, c in enumerate(
    [(1.0, 0.1, 0.1), (1.0, 0.8, 0.0), (0.1, 0.5, 1.0), (0.1, 0.9, 0.4), (1.0, 1.0, 1.0)])]
red_light = surf("lamp_red", (1.0, 0.05, 0.02), emission=(1.0, 0.05, 0.02), strength=4.0)
trunk = surf("wood_bark", (0.25, 0.16, 0.09))
leaves = surf("leaves_green", (0.12, 0.33, 0.08))

W = 14.0                       # track width
HALF = W / 2

# Centre line, counter-clockwise; the first two points are the start/finish straight (+x).
CTRL = [(-240, -150), (40, -150), (210, -150), (290, -120), (300, -40), (250, 10), (170, 0), (110, 40),
        (110, 120), (170, 170), (240, 200), (230, 260), (140, 280), (20, 250), (-60, 190), (-90, 110),
        (-160, 70), (-250, 100), (-330, 70), (-360, -30), (-330, -120)]
pts = catmull_closed(CTRL, 2.0)
tan, right, curv = frames(pts)
curv = smooth(curv, 4)
n = len(pts)
banks = [0.0] * n
start = min(range(n), key=lambda i: (pts[i].x - 20) ** 2 + (pts[i].y + 150) ** 2)
print("samples", n, "length m", n * 2)

box("ground", (1100, 800, 0.2), (-30, 60, -0.1), grass)

corner = [abs(c) > 1 / 140 for c in curv]
outside = [1 if c > 0 else -1 for c in curv]   # left turn -> outside is the right side

ribbon("track", pts, right, banks, -HALF, HALF, 0.03, asphalt)
ribbon("runoff", pts, right, banks, -HALF - 4, -HALF, 0.02, runoff)
ribbon("runoff", pts, right, banks, HALF, HALF + 4, 0.02, runoff)
for s in (-1, 1):
    ribbon("edge_line", pts, right, banks, s * (HALF - 0.45), s * (HALF - 0.25), 0.034, line_w)
    for col, phase in ((kerb_r, 0), (kerb_w, 1)):
        mask = [corner[i] and (i // 1) % 2 == phase for i in range(n)]
        ribbon("kerb", pts, right, banks, s * HALF + (0 if s > 0 else -1.6), s * HALF + (1.6 if s > 0 else 0), 0.045, col, mask=mask)
# Gravel traps on the outside of corners, where they do not run onto another part of the track.
for s in (-1, 1):
    mask = []
    for i in range(n):
        far = edge_point(pts[i], right[i], 0, s * (HALF + 22))
        mask.append(corner[i] and outside[i] == s and clear_of_track(pts, far.x, far.y, HALF + 4, skip_near=i))
    ribbon("gravel", pts, right, banks, s * HALF + (4 if s > 0 else -22), s * HALF + (22 if s > 0 else -4), 0.015, gravel, mask=mask)

# Armco / concrete barriers: further out at corners (behind the gravel).
for s in (-1, 1):
    for off, need_corner in ((HALF + 24, True), (HALF + 6, False)):
        mask = []
        for i in range(n):
            want = (corner[i] and outside[i] == s) if need_corner else not (corner[i] and outside[i] == s)
            p = edge_point(pts[i], right[i], 0, s * off)
            mask.append(want and clear_of_track(pts, p.x, p.y, off - 2, skip_near=i))
        wall_strip("barrier", pts, right, banks, s * off, 1.0, 0.4, armco if need_corner else concrete, mask=mask)

# Start/finish line (chequered) and the grid boxes behind it.
p, t, r = pts[start], tan[start], right[start]
yaw = math.degrees(math.atan2(t.y, t.x)) - 90
for k in range(14):
    for row in range(2):
        col = kerb_w if (k + row) % 2 == 0 else dark
        q = p + r * (-HALF + 0.5 + k) + t * (row - 0.5)
        box("finish", (1.0, 1.0, 0.01), (q.x, q.y, 0.04), col, rot=(0, 0, math.radians(yaw)))
for g in range(12):
    i = (start - 4 - g * 4) % n
    q = pts[i] + right[i] * (3.5 if g % 2 == 0 else -3.5)
    box("grid_box", (4.0, 0.25, 0.01), (q.x, q.y, 0.04), line_w, rot=(0, 0, math.atan2(tan[i].y, tan[i].x) + math.pi / 2))

# Start gantry with lights across the track.
gi = (start + 20) % n
q, r = pts[gi], right[gi]
ang = math.atan2(tan[gi].y, tan[gi].x)
for s in (-1, 1):
    c = q + r * s * (HALF + 1.5)
    box("gantry_leg", (0.8, 0.8, 8.0), (c.x, c.y, 4.0), steel, rot=(0, 0, ang))
box("gantry_beam", (1.2, W + 4, 1.4), (q.x, q.y, 7.5), dark, rot=(0, 0, ang))
for k in range(5):
    c = q + r * (k - 2) * 1.6
    box("gantry_light", (0.4, 1.0, 0.8), (c.x - tan[gi].x * 0.7, c.y - tan[gi].y * 0.7, 7.4), red_light, rot=(0, 0, ang))

# Pit lane inside the main straight, pit wall, garages and a control tower.
pit_a, pit_b = (start - 70) % n, (start + 60) % n
pit_idx = [(pit_a + k) % n for k in range((pit_b - pit_a) % n)]
pit_mask = [False] * n
for i in pit_idx:
    pit_mask[i] = True
ribbon("pit_lane", pts, right, banks, -HALF - 22, -HALF - 10, 0.03, asphalt, mask=pit_mask)
wall_strip("pit_wall", pts, right, banks, -HALF - 6.5, 1.2, 0.5, concrete, mask=pit_mask)
x0 = min(pts[i].x for i in pit_idx) + 10
x1 = max(pts[i].x for i in pit_idx) - 10
yb = pts[start].y + HALF + 31
box("garages", (x1 - x0, 14, 7), ((x0 + x1) / 2, yb, 3.5), concrete)
box("garage_roof", (x1 - x0 + 2, 16, 0.5), ((x0 + x1) / 2, yb, 7.25), steel)
k = 0
x = x0 + 3
while x + 8 < x1:
    box("garage_door", (8, 0.2, 5), (x + 4, yb - 7.05, 2.5), team_cols[k % len(team_cols)])
    k += 1
    x += 10
box("paddock_glass", (x1 - x0 - 4, 0.2, 2.5), ((x0 + x1) / 2, yb - 7.1, 6.0), glass)
box("control_tower", (12, 12, 22), (x1 + 10, yb, 11), concrete)
box("control_glass", (12.2, 12.2, 4), (x1 + 10, yb, 18), glass)

# Grandstands on the outside of the main straight.
for gx in range(-180, 140, 70):
    gy = pts[start].y - HALF - 16
    for row in range(10):
        box("stand_step", (60, 1.2, 0.6), (gx, gy - row * 1.2, 0.5 + row * 0.7), random.choice(seat_cols))
        crowd_row(gx - 29, gx + 29, gy - row * 1.2, 0.8 + row * 0.7, fill=0.5)
    box("stand_back", (60, 0.5, 9), (gx, gy - 12.5, 4.5), concrete)
    box("stand_roof", (62, 15, 0.3), (gx, gy - 6, 11.0), steel, rot=(math.radians(-6), 0, 0))
    for sx in (-28, 0, 28):
        cyl("stand_post", 0.25, 10.5, (gx + sx, gy - 12.4, 5.3), steel, segs=8)

# Billboards and marshal posts beside the track; an advertising bridge over the back section.
for i in range(0, n, 60):
    s = -outside[i] if corner[i] else random.choice((-1, 1))
    q = edge_point(pts[i], right[i], 0, s * (HALF + 9))
    if not clear_of_track(pts, q.x, q.y, HALF + 6, skip_near=i):
        continue
    a = math.atan2(tan[i].y, tan[i].x)
    box("billboard", (10, 0.3, 2.5), (q.x, q.y, 1.6), random.choice(boards), rot=(0, 0, a))
    box("marshal_post", (2, 2, 2.6), (q.x + tan[i].x * 8, q.y + tan[i].y * 8, 1.3), kerb_w, rot=(0, 0, a))
bi = min(range(n), key=lambda i: (pts[i].x + 160) ** 2 + (pts[i].y - 70) ** 2)
q, r = pts[bi], right[bi]
a = math.atan2(tan[bi].y, tan[bi].x)
for s in (-1, 1):
    c = q + r * s * (HALF + 4)
    box("bridge_pier", (2, 2, 9), (c.x, c.y, 4.5), concrete, rot=(0, 0, a))
box("bridge_deck", (3, W + 10, 1.2), (q.x, q.y, 8.0), concrete, rot=(0, 0, a))
box("bridge_sign", (0.4, W + 10, 2.2), (q.x - tan[bi].x * 1.6, q.y - tan[bi].y * 1.6, 8.3), boards[1], rot=(0, 0, a))
box("bridge_sign", (0.4, W + 10, 2.2), (q.x + tan[bi].x * 1.6, q.y + tan[bi].y * 1.6, 8.3), boards[2], rot=(0, 0, a))

# Tyre walls in front of the armco on the outside of corners.
for i in range(0, n, 2):
    if not (corner[i]):
        continue
    s_ = outside[i]
    q = edge_point(pts[i], right[i], 0, s_ * (HALF + 23.2))
    if clear_of_track(pts, q.x, q.y, HALF + 21, skip_near=i):
        tyre_stack((q.x, q.y, 0), 3)
# Team trucks and motorhomes in the paddock behind the garages.
for k in range(12):
    tx = x0 + 12 + k * ((x1 - x0 - 24) / 11)
    truck((tx, yb + 26, 0), 0 if k % 2 else 180, [(0.8, 0.05, 0.05), (0.05, 0.1, 0.35), (0.0, 0.55, 0.5), (1.0, 0.45, 0.0), (0.0, 0.35, 0.15), (0.9, 0.9, 0.9)][k % 6])
for k in range(10):
    parasol((x0 + 20 + k * 25, yb + 12, 0), (0.95, 0.95, 0.95))
# TV camera towers at the corners.
for i in range(30, n, 140):
    q = edge_point(pts[i], right[i], 0, -outside[i] * (HALF + 14))
    if clear_of_track(pts, q.x, q.y, HALF + 10, skip_near=i):
        for sx_ in (-1, 1):
            for sy_ in (-1, 1):
                cyl("tv_tower_leg", 0.08, 6, (q.x + sx_ * 0.9, q.y + sy_ * 0.9, 3), steel, segs=6)
        box("tv_tower_deck", (2.4, 2.4, 0.15), (q.x, q.y, 6.05), steel)
        box("tv_camera", (0.4, 0.8, 0.4), (q.x, q.y, 6.5), dark)

# Trees outside the circuit.
for k in range(420):
    x, y = random.uniform(-560, 520), random.uniform(-340, 460)
    if clear_of_track(pts, x, y, 32) and not (-260 < x < 160 and -215 < y < -95):
        tree("tree", (x, y, 0), random.uniform(8, 16), random.choice(["round", "pine"]), trunk, leaves)

# Spawn on the grass between the pit wall and the track at the start line, facing down the straight.
q = pts[start] - right[start] * (HALF + 3.5) - tan[start] * 10
empty("spawn", (q.x, q.y, 0.04), math.degrees(math.atan2(tan[start].y, tan[start].x)) - 90)

print(export_track("public/models/maps/f1.track.json", pts, right, banks, W, start))
print(finish_map("public/models/maps/f1.glb"))
