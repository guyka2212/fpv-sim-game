# Speedway: 1.7 km oval with 24-degree banked turns, SAFER walls and catch fence, a huge
# frontstretch grandstand, pit road and garages in the infield, a scoring pylon and light towers.
# Stock cars race in a pack along the exported driving line (oval.track.json).
exec(open(r"C:\Users\User\Documents\fly-sim\blender\lib.py").read())
exec(open(r"C:\Users\User\Documents\fly-sim\blender\maplib.py").read())
exec(open(r"C:\Users\User\Documents\fly-sim\blender\detail.py").read())
exec(open(r"C:\Users\User\Documents\fly-sim\blender\tracklib.py").read())
clear_scene()
random.seed(55)

grass = surf("grass_infield", (0.2, 0.46, 0.14))
grass_dark = surf("grass_stripe", (0.15, 0.38, 0.1))
asphalt = surf("asphalt_track", (0.11, 0.11, 0.12), rough=0.85)
apron = surf("asphalt_apron", (0.22, 0.22, 0.23), rough=0.9)
concrete = surf("concrete_wall", (0.88, 0.88, 0.86))
concrete_d = surf("concrete_stand", (0.6, 0.6, 0.6))
line_w = surf("paint_line", (0.95, 0.95, 0.92), rough=0.6)
line_y = surf("paint_yellow", (0.95, 0.8, 0.05), rough=0.6)
line_r = surf("paint_red", (0.85, 0.05, 0.05), rough=0.6)
fence = surf("glass_fence", (0.35, 0.37, 0.4), rough=0.4, metallic=0.6, alpha=0.35)
steel = surf("metal_steel", (0.5, 0.52, 0.55), metallic=0.9, rough=0.35)
dark = surf("metal_dark", (0.08, 0.08, 0.09), metallic=0.6, rough=0.5)
glass = surf("window_building", (0.2, 0.3, 0.4), rough=0.08, metallic=0.5)
seat_cols = [surf("plastic_seat_red", (0.75, 0.06, 0.06), rough=0.6), surf("plastic_seat_blue", (0.06, 0.2, 0.7), rough=0.6),
             surf("plastic_seat_yellow", (0.9, 0.7, 0.05), rough=0.6)]
boards = [surf("sign_board_%d" % i, c, emission=c, strength=1.5) for i, c in enumerate(
    [(1.0, 0.1, 0.1), (1.0, 0.8, 0.0), (0.1, 0.5, 1.0), (0.1, 0.9, 0.4), (1.0, 1.0, 1.0)])]
lamp = surf("lamp_glow", (1.0, 0.97, 0.9), emission=(1.0, 0.95, 0.85), strength=3.0)
team_cols = [surf("paint_team_%d" % i, c, rough=0.4) for i, c in enumerate(
    [(0.8, 0.05, 0.05), (0.05, 0.1, 0.5), (1.0, 0.75, 0.0), (0.0, 0.5, 0.2), (0.95, 0.95, 0.95), (0.1, 0.1, 0.1)])]
trunk = surf("wood_bark", (0.25, 0.16, 0.09))
leaves = surf("leaves_green", (0.12, 0.33, 0.08))
water = surf("water_lake", (0.08, 0.22, 0.3), rough=0.05, metallic=0.2)

W = 18.0
HALF = W / 2
L = 200.0        # half length of the straights
R = 140.0        # turn radius (centre line)
STEP = 2.0

# Stadium-shaped centre line, counter-clockwise, starting at the start/finish line.
raw = []
for k in range(int(2 * L / STEP)):
    raw.append(Vector((-L + k * STEP, -R, 0)))
for k in range(int(math.pi * R / STEP)):
    a = -math.pi / 2 + k * STEP / R
    raw.append(Vector((L + R * math.cos(a), R * math.sin(a), 0)))
for k in range(int(2 * L / STEP)):
    raw.append(Vector((L - k * STEP, R, 0)))
for k in range(int(math.pi * R / STEP)):
    a = math.pi / 2 + k * STEP / R
    raw.append(Vector((-L + R * math.cos(a), R * math.sin(a), 0)))
pts = resample(raw, STEP)
tan, right, curv = frames(pts)
n = len(pts)
turn = smooth([min(1.0, abs(c) * R) for c in curv], 30)
banks = [math.radians(8 + 16 * t) for t in turn]
flat = [p.copy() for p in pts]
for i in range(n):
    pts[i].z = HALF * math.sin(banks[i])          # inside edge sits on the ground
start = min(range(n), key=lambda i: (pts[i].x - 0) ** 2 + (pts[i].y + R) ** 2)
print("samples", n, "lap m", n * STEP)

box("ground", (1300, 1000, 0.2), (0, 0, -0.1), grass)
for k in range(-6, 7):
    box("mow_stripe", (16, 2 * R - 60, 0.01), (k * 32, 0, 0.005), grass_dark)

ribbon("track", pts, right, banks, -HALF, HALF, 0.0, asphalt)
ribbon("apron", flat, right, [0.0] * n, -HALF - 10, -HALF, 0.01, apron)
ribbon("line_yellow", flat, right, [0.0] * n, -HALF - 0.5, -HALF - 0.2, 0.02, line_y)
ribbon("line_white", pts, right, banks, HALF - 0.6, HALF - 0.3, 0.02, line_w)
# Painted lane marks on the frontstretch and backstretch (bank < 12 deg).
straight = [t < 0.05 for t in turn]
dash = [straight[i] and (i // 3) % 3 == 0 for i in range(n)]
ribbon("lane_dash", pts, right, banks, -0.15, 0.15, 0.02, line_w, mask=dash)

# Outer SAFER wall on top of the banking, catch fence above it, and the skirt down to the ground.
wall_strip("safer_wall", pts, right, banks, HALF + 0.4, 1.2, 0.8, concrete)
wall_strip("wall_stripe", pts, right, banks, HALF - 0.02, 0.25, 0.05, line_r, base_lift=0.6)
wall_strip("catch_fence", pts, right, banks, HALF + 0.6, 4.5, 0.05, fence, base_lift=1.2)
for i in range(0, n, 6):
    q = edge_point(pts[i], right[i], banks[i], HALF + 0.6, 1.2)
    cyl("fence_post", 0.08, 5.0, (q.x, q.y, q.z + 2.5), steel, segs=6)
bm = bmesh.new()
tops = [bm.verts.new(edge_point(pts[i], right[i], banks[i], HALF + 0.8)) for i in range(n)]
bots = [bm.verts.new(Vector((tops[i].co.x, tops[i].co.y, 0))) for i in range(n)]
for i in range(n):
    bm.faces.new((tops[i], tops[(i + 1) % n], bots[(i + 1) % n], bots[i]))
bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
_obj_from_bm("embankment", bm, concrete_d)

# Start/finish line and flag stand over the track.
p, t, r = pts[start], tan[start], right[start]
a = math.atan2(t.y, t.x)
for k in range(18):
    for row in range(2):
        q = edge_point(p, r, banks[start], -HALF + 0.5 + k, 0.02) + t * (row - 0.5)
        box("finish", (1.0, 1.0, 0.01), (q.x, q.y, q.z), line_w if (k + row) % 2 == 0 else dark, rot=(-banks[start], 0, a))
q = edge_point(p, r, banks[start], HALF + 2)
box("flag_stand_leg", (1.0, 1.0, 9.0), (q.x, q.y, q.z + 4.5), steel)
qi = edge_point(p, r, banks[start], -HALF - 2)
box("flag_stand_leg", (1.0, 1.0, 9.0 + q.z - qi.z), (qi.x, qi.y, qi.z + (9.0 + q.z - qi.z) / 2), steel)
box("flag_stand", (3.0, W + 6, 1.6), (p.x, p.y, q.z + 9.0), dark, rot=(0, 0, a))
box("flag_stand_sign", (0.2, W + 6, 1.2), (p.x - t.x * 1.6, p.y - t.y * 1.6, q.z + 9.0), boards[1], rot=(0, 0, a))

# Frontstretch grandstand outside the front straight.
gy0 = -R - HALF - 26
for row in range(28):
    box("stand_step", (380, 1.1, 0.7), (0, gy0 - row * 1.1, 1.0 + row * 0.75), seat_cols[(row // 7) % 3])
    crowd_row(-188, 188, gy0 - row * 1.1, 1.35 + row * 0.75, fill=0.3)
box("stand_back", (380, 1.0, 25), (0, gy0 - 31.5, 12.5), concrete_d)
box("suites", (380, 8, 8), (0, gy0 - 35, 29), glass)
box("suites_roof", (384, 14, 0.8), (0, gy0 - 33, 33.4), steel)
for sx in range(-180, 181, 45):
    box("stand_column", (1.2, 1.2, 25), (sx, gy0 - 30.5, 12.5), concrete)
    box("stand_vomitory", (3, 0.6, 3), (sx + 22, gy0 - 15, 13.0), dark)
# Backstretch stands (smaller).
gy1 = R + HALF + 26
for row in range(12):
    box("stand_step", (240, 1.1, 0.7), (0, gy1 + row * 1.1, 1.0 + row * 0.75), seat_cols[(row // 4) % 3])
    crowd_row(-118, 118, gy1 + row * 1.1, 1.35 + row * 0.75, fill=0.3)
box("stand_back", (240, 1.0, 11), (0, gy1 + 13.5, 5.5), concrete_d)

# Pit road and garages in the infield along the frontstretch.
pit = [abs(pts[i].x) < L - 10 and pts[i].y < 0 for i in range(n)]
ribbon("pit_road", flat, right, [0.0] * n, -HALF - 30, -HALF - 14, 0.02, apron, mask=pit)
wall_strip("pit_wall", flat, right, [0.0] * n, -HALF - 12, 1.1, 0.6, concrete, mask=pit)
for k in range(30):
    x = -L + 20 + k * 12.5
    box("pit_box", (0.2, 10, 0.01), (x, -R + HALF + 22, 0.03), line_w)
    box("pit_cart", (1.6, 1.0, 1.4), (x + 6, -R + HALF + 33, 0.7), team_cols[k % len(team_cols)])
box("garages", (300, 20, 6), (0, -R + HALF + 60, 3), concrete)
box("garage_roof", (304, 24, 0.5), (0, -R + HALF + 60, 6.25), steel)
for k in range(24):
    box("garage_door", (8, 0.2, 4.2), (-138 + k * 12, -R + HALF + 49.9, 2.1), team_cols[k % len(team_cols)])
box("media_center", (40, 18, 14), (0, R - HALF - 50, 7), glass)

# Scoring pylon and an infield lake.
box("pylon", (5, 5, 34), (-80, 10, 17), dark)
for k in range(8):
    box("pylon_digit", (5.2, 5.2, 2.6), (-80, 10, 6 + k * 3.4), boards[k % len(boards)])
box("pylon_top", (8, 8, 3), (-80, 10, 35.5), boards[1])
cyl("lake", 40, 0.1, (90, 20, 0.04), water, segs=40)
for k in range(10):
    a = k * math.tau / 10
    tree("tree", (90 + math.cos(a) * 48, 20 + math.sin(a) * 30, 0), random.uniform(7, 11), "round", trunk, leaves)

# Light towers around the outside.
for i in range(0, n, 70):
    q = edge_point(flat[i], right[i], 0, HALF + 34)
    cyl("light_tower", 0.6, 40, (q.x, q.y, 20), steel, segs=8)
    box("light_bank", (6, 1.2, 3), (q.x, q.y, 40), lamp, rot=(0, 0, math.atan2(tan[i].y, tan[i].x)))
    box("billboard", (14, 0.4, 4), (q.x + tan[i].x * 12, q.y + tan[i].y * 12, 4), random.choice(boards), rot=(0, 0, math.atan2(tan[i].y, tan[i].x)))

# Haulers lined up behind the garages, tyre stacks at the pit boxes, RVs in the infield.
for k in range(18):
    truck((-170 + k * 20, -R + HALF + 85, 0), 0 if k % 2 else 180, [(0.8, 0.05, 0.05), (0.05, 0.1, 0.5), (1.0, 0.75, 0.0), (0.0, 0.5, 0.2), (0.95, 0.95, 0.95), (0.1, 0.1, 0.1)][k % 6])
for k in range(30):
    tyre_stack((-L + 26 + k * 12.5, -R + HALF + 36, 0), random.randint(2, 4))
for k in range(14):
    a = k * math.tau / 14
    car("rv_%d" % k, (-30 + 70 * math.cos(a), 30 + 40 * math.sin(a), 0), math.degrees(a), (0.9, 0.9, 0.88), "suv")
    if k % 2:
        parasol((-30 + 70 * math.cos(a) + 4, 30 + 40 * math.sin(a), 0), (1.0, 0.75, 0.0))

# Trees and car parks beyond the stands.
for k in range(260):
    x, y = random.uniform(-640, 640), random.uniform(-480, 480)
    if (x / (L + R + 70)) ** 2 + (y / (R + 120)) ** 2 > 1 and not (-200 < x < 200 and y < -R - 60 and y > -R - 120):
        tree("tree", (x, y, 0), random.uniform(8, 15), random.choice(["round", "pine"]), trunk, leaves)

# Spawn on the infield grass just inside pit road, near the start line, facing down the frontstretch.
q = flat[start] - right[start] * (HALF + 40) - tan[start] * 30
empty("spawn", (q.x, q.y, 0.05), -90)

print(export_track("public/models/maps/oval.track.json", pts, right, banks, W, start))
print(finish_map("public/models/maps/oval.glb"))
