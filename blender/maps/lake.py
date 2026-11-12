# Freestyle lake: a 500 m summer lake in forested hills. An island with a lighthouse, a long pier,
# a boathouse on stilts you can fly straight through, moored boats and sailboats, a floating swim
# platform with a diving tower, a stone arch bridge over the outlet river and lakeside cabins.
exec(open(r"C:\Users\User\Documents\fly-sim\blender\lib.py").read())
exec(open(r"C:\Users\User\Documents\fly-sim\blender\maplib.py").read())
exec(open(r"C:\Users\User\Documents\fly-sim\blender\detail.py").read())
from mathutils import noise
clear_scene()
random.seed(41)

grass = surf("grass_meadow", (0.25, 0.45, 0.15))
forest = surf("grass_forest", (0.15, 0.3, 0.1))
sand = surf("dirt_beach", (0.72, 0.64, 0.46))
cliff = surf("rock_cliff", (0.42, 0.4, 0.37), rough=0.95)
lakebed = surf("dirt_lakebed", (0.28, 0.25, 0.19))
water = surf("water_lake", (0.05, 0.22, 0.3), rough=0.04, metallic=0.2)
plank = surf("wood_planks", (0.52, 0.38, 0.24))
post_m = surf("wood_post", (0.3, 0.22, 0.14))
logs = surf("wood_logs", (0.45, 0.3, 0.18))
stone = surf("stone_bridge", (0.6, 0.57, 0.52))
white = surf("paint_white", (0.92, 0.92, 0.9), rough=0.5)
red = surf("paint_red", (0.75, 0.08, 0.06), rough=0.5)
roof_m = surf("roof_shingle", (0.26, 0.2, 0.18))
boathouse_m = surf("wood_boathouse", (0.55, 0.16, 0.1))
lantern = surf("glass_lantern", (0.7, 0.85, 0.9), rough=0.05, alpha=0.35)
beacon = surf("lamp_beacon", (1.0, 0.9, 0.6), emission=(1.0, 0.85, 0.5), strength=5.0)
window_m = surf("window_cabin", (0.3, 0.4, 0.45), rough=0.08, metallic=0.5)
dark = surf("metal_dark", (0.12, 0.12, 0.13), metallic=0.8, rough=0.4)
buoy_m = [red, white, surf("plastic_yellow", (1.0, 0.8, 0.05), rough=0.5)]
tuft_m = surf("grass_reed", (0.35, 0.45, 0.2))

SIZE = 1000.0
ISLAND = (70.0, 60.0, 40.0)


def shore_r(a):
    return 230 + 38 * math.sin(3 * a + 1.0) + 22 * math.sin(5 * a + 2.3) + 12 * math.sin(9 * a)


def river_y(x):
    return 15 * math.sin(x / 40.0)


def smooth(t):
    t = min(1.0, max(0.0, t))
    return t * t * (3 - 2 * t)


def height(x, y):
    a = math.atan2(y, x)
    r = math.hypot(x, y)
    R = shore_r(a)
    n = noise.fractal(Vector((x / 220.0, y / 220.0, 0.4)), 0.5, 2.0, 4, noise_basis="PERLIN_ORIGINAL")
    if r < R:
        h = -10 * (1 - r / R) ** 0.7
    else:
        d = r - R
        h = 2.2 * smooth(d / 30) + smooth((d - 20) / 260) * (48 + 34 * n) + 4 * n * smooth(d / 40)
    # Island.
    di = math.hypot(x - ISLAND[0], y - ISLAND[1])
    if di < ISLAND[2]:
        h = max(h, 12 * (1 - (di / ISLAND[2]) ** 2) - 2 + 1.5 * n)
    # Outlet river to the east.
    if x > 200:
        dy = abs(y - river_y(x))
        h = min(h, -2.5 + max(0.0, dy - 8) ** 1.5 * 0.4)
    # The map ends in high ridges.
    edge = max(abs(x), abs(y)) / (SIZE / 2)
    if edge > 0.78:
        h += ((edge - 0.78) / 0.22) ** 2 * 110
    return h


def pick(cx, cy, cz, nz):
    if cz < -0.4:
        return 4
    if cz < 2.6 and math.hypot(cx, cy) < shore_r(math.atan2(cy, cx)) + 40:
        return 2
    if nz < 0.58:
        return 3
    return 1 if cz > 14 else 0


terrain("terrain", -SIZE / 2, SIZE / 2, -SIZE / 2, SIZE / 2, 6.0, height, [grass, forest, sand, cliff, lakebed], pick)
box("water", (SIZE, SIZE, 0.3), (0, 0, -0.15), water)


def shore_point(deg, inset):
    """Point on the shore at angle deg, inset metres toward the lake (negative: inland)."""
    a = math.radians(deg)
    r = shore_r(a) - inset
    return r * math.cos(a), r * math.sin(a), a


def place(parts_or_obj, loc, yaw):
    objs = parts_or_obj if isinstance(parts_or_obj, list) else [parts_or_obj]
    o = zero_origin(join(objs, objs[0].name))
    o.location = loc
    o.rotation_euler = (0, 0, yaw)
    return o


# ---------------------------------------------------------------- long pier with moored boats
PY0, PY1 = -232.0, -150.0
pz = 1.1
for k in range(int((PY1 - PY0) / 1.0)):
    box("pier_plank", (3.0, 0.9, 0.08), (0, PY0 + 0.5 + k * 1.0, pz), plank)
for y in range(int(PY0), int(PY1) + 1, 4):
    for sx in (-1, 1):
        cyl("pier_post", 0.13, 6.0, (sx * 1.6, y, pz - 2.9), post_m, segs=8)
box("pier_head", (12, 6, 0.1), (0, PY1 + 3, pz), plank)
for sx in (-1, 1):
    for y in (PY1 + 0.5, PY1 + 5.5):
        cyl("pier_post", 0.16, 6.2, (sx * 5.8, y, pz - 2.9), post_m, segs=8)
    railing((sx * 5.9, PY1 + 0.2), (sx * 5.9, PY1 + 5.8), pz + 0.05, material=post_m)
for k in range(3):
    street_lamp((1.4, PY0 + 18 + k * 25, pz + 0.05), 180, h=3.5)
for k, (y, side, col) in enumerate(((-205, 1, (0.9, 0.9, 0.92)), (-190, -1, (0.1, 0.3, 0.6)), (-172, 1, (0.75, 0.1, 0.1)), (-160, -1, (0.95, 0.7, 0.1)))):
    boat("moored_%d" % k, (side * 4.6, y, -0.05), 90, random.uniform(5, 7), col, sail=(k == 2))

# ---------------------------------------------------------------- boathouse on stilts (open both ends)
bx, by, ba = shore_point(-140, 9)
parts = []
for sx in (-1, 1):
    parts += wall("bh_side", (sx * 6, -10), (sx * 6, 10), 0.8, 5.5, 0.3, boathouse_m, openings=((6, 2.4, 1.2, 2.6), (14, 2.4, 1.2, 2.6)))
for y in (-10, 10):
    parts += wall("bh_end", (-6.15, y), (6.15, y), 0.8, 5.5, 0.3, boathouse_m, openings=((6.15, 8.0, 0.0, 4.6),))
    # Gable triangle above the door.
    bm = bmesh.new()
    a_ = bm.verts.new((-6.3, y, 6.3))
    b_ = bm.verts.new((6.3, y, 6.3))
    c_ = bm.verts.new((0, y, 9.2))
    bm.faces.new((a_, b_, c_))
    bmesh.ops.solidify(bm, geom=bm.faces[:], thickness=0.3)
    parts.append(_obj_from_bm("bh_gable", bm, boathouse_m))
for sx in (-1, 1):
    parts.append(box("bh_walk", (2.4, 20, 0.15), (sx * 4.6, 0, 0.8), plank))
    parts.append(box("bh_roof", (7.2, 21.6, 0.2), (sx * 3.2, 0, 7.75), roof_m, rot=(0, sx * math.radians(25), 0)))
    for y in range(-10, 11, 4):
        parts.append(cyl("bh_stilt", 0.16, 4.5, (sx * 5.8, y, -1.5), post_m, segs=8))
parts.append(box("bh_ridge", (0.4, 21.8, 0.3), (0, 0, 9.3), roof_m))
parts.append(boat("bh_boat", (0, -2, -0.05), 90, 6.5, (0.08, 0.35, 0.3)))
place(parts, (bx, by, 0), ba + math.pi / 2)

# ---------------------------------------------------------------- island lighthouse
ix, iy = ISLAND[0], ISLAND[1]
iz = height(ix, iy) - 0.5
box("lh_base", (8, 8, 1.4), (ix, iy, iz + 0.3), stone)
H, R0, R1 = 20.0, 3.2, 2.2
for k in range(5):
    z0, z1 = k * H / 5, (k + 1) * H / 5
    r_a = R0 + (R1 - R0) * z0 / H
    r_b = R0 + (R1 - R0) * z1 / H
    cyl("lh_tower", r_a, z1 - z0, (ix, iy, iz + 1.0 + (z0 + z1) / 2), red if k % 2 else white, r2=r_b, segs=24)
top = iz + 1.0 + H
cyl("lh_gallery", 3.5, 0.35, (ix, iy, top + 0.17), dark, segs=24)
ring("lh_rail", 3.3, 3.4, 1.0, (ix, iy, top + 0.85), dark, segs=24)
cyl("lh_lantern", 1.7, 2.6, (ix, iy, top + 1.65), lantern, segs=16)
sphere("lh_beacon", 0.7, (ix, iy, top + 1.7), beacon)
for k in range(8):
    a = k * math.tau / 8
    cyl("lh_mullion", 0.05, 2.6, (ix + math.cos(a) * 1.72, iy + math.sin(a) * 1.72, top + 1.65), dark, segs=6)
cyl("lh_cap", 2.0, 1.8, (ix, iy, top + 3.85), red, r2=0.15, segs=16, smooth=False)
cyl("lh_vane", 0.05, 1.5, (ix, iy, top + 5.4), dark, segs=6)
kx, ky = ix - 9, iy - 4
kz = height(kx, ky) - 0.3
box("keeper_house", (7, 5, 3.6), (kx, ky, kz + 1.8), white)
for sy in (-1, 1):
    box("keeper_roof", (7.6, 3.2, 0.18), (kx, ky + sy * 1.3, kz + 4.5), red, rot=(-sy * math.radians(30), 0, 0))
box("keeper_door", (1.0, 0.08, 2.0), (kx + 1.5, ky - 2.54, kz + 1.0), plank)
for wx in (-1.8, 3.0):
    box("keeper_window", (1.0, 0.08, 1.0), (kx + wx * 0.8, ky - 2.54, kz + 2.2), window_m)
for _ in range(14):
    a = random.uniform(0, math.tau)
    d = random.uniform(10, 26)
    tx, ty = ix + math.cos(a) * d, iy + math.sin(a) * d
    if math.hypot(tx - kx, ty - ky) > 7:
        tree("island_pine", (tx, ty, height(tx, ty) - 0.3), random.uniform(8, 14), "pine")
for _ in range(26):
    a = random.uniform(0, math.tau)
    d = random.uniform(33, 40)
    rx, ry = ix + math.cos(a) * d, iy + math.sin(a) * d
    rock("island_rock", (rx, ry, max(height(rx, ry), -1.0)), random.uniform(0.8, 2.4), cliff)
# Jetty on the island.
for k in range(14):
    box("island_jetty", (2.2, 0.9, 0.08), (ix - 12, iy - 30 - k * 1.0, 0.9), plank)
for k in range(0, 14, 3):
    for sx in (-1, 1):
        cyl("island_post", 0.1, 4.0, (ix - 12 + sx * 1.0, iy - 30 - k, -1.0), post_m, segs=6)

# ---------------------------------------------------------------- swim platform, diving tower, buoys
sx_, sy_ = -90.0, -70.0
box("swim_platform", (7, 7, 0.5), (sx_, sy_, 0.2), plank)
for cx in (-3.2, 3.2):
    for cy in (-3.2, 3.2):
        cyl("barrel", 0.35, 0.9, (sx_ + cx, sy_ + cy, -0.15), white, segs=10)
for cx in (-1.4, 1.4):
    for cy in (-1.4, 1.4):
        cyl("dive_post", 0.1, 5.5, (sx_ + cx, sy_ + cy, 3.2), white, segs=8)
box("dive_top", (3.4, 3.4, 0.2), (sx_, sy_, 6.0), plank)
box("dive_board", (0.6, 3.0, 0.08), (sx_, sy_ + 2.9, 6.1), white)
railing((sx_ - 1.7, sy_ - 1.7), (sx_ + 1.7, sy_ - 1.7), 6.1, material=white)
for k in range(24):
    a = math.radians(200 + k * 6)
    bx_, by_ = sx_ + math.cos(a) * 34 + 10, sy_ + math.sin(a) * 34 + 30
    sphere("buoy", 0.35, (bx_, by_, 0.1), buoy_m[k % 3], segs=10, rings=6)

# ---------------------------------------------------------------- sailboats out on the lake
placed = 0
while placed < 9:
    x, y = random.uniform(-200, 200), random.uniform(-190, 200)
    if height(x, y) > -3 or math.hypot(x - ix, y - iy) < 60 or abs(x) < 14 and y < -140:
        continue
    boat("sailboat", (x, y, -0.05), random.uniform(0, 360), random.uniform(5, 9),
         random.choice([(0.95, 0.95, 0.95), (0.1, 0.2, 0.5), (0.7, 0.1, 0.1), (0.1, 0.4, 0.3)]), sail=True)
    placed += 1

# ---------------------------------------------------------------- stone arch bridge over the outlet river
rx = 330.0
ry = river_y(rx)
prof = [(-24, -1.5), (-9, -1.5)]
for k in range(13):
    t = math.pi * k / 12
    prof.append((-9 * math.cos(t), -0.5 + 4.6 * math.sin(t)))
prof += [(9, -1.5), (24, -1.5), (24, 5.4), (-24, 5.4)]
sweep("bridge", [(rx - 3.2, ry, 0, 1), (rx + 3.2, ry, 0, 1)], prof, [stone], closed=False)
for sx in (-1, 1):
    box("bridge_parapet", (0.5, 48, 0.9), (rx + sx * 3.0, ry, 5.85), stone)
box("bridge_road", (5.5, 48, 0.05), (rx, ry, 5.42), surf("dirt_path", (0.5, 0.43, 0.32)))
for sx in (-1, 1):
    for sy in (-1, 1):
        street_lamp((rx + sx * 3.0, ry + sy * 21, 6.3), 0 if sx < 0 else 180, h=3.2)

# ---------------------------------------------------------------- lakeside cabins with docks
cabins = []
for k, deg in enumerate((-60, 20, 110, 160, 205)):
    x, y, a = shore_point(deg, -26)
    z = max(height(x + dx, y + dy) for dx in (-5, 0, 5) for dy in (-5, 0, 5)) - 0.4
    cabins.append((x, y))
    parts = [box("cabin_base", (8.6, 6.6, 1.4), (0, 0, -0.3), stone)]
    for j in range(9):
        zz = 0.6 + j * 0.33
        for sy in (-1, 1):
            parts.append(cyl("cabin_log", 0.17, 8.8, (0, sy * 2.9, zz), logs, rot=(0, math.radians(90), 0), segs=8))
        for sx in (-1, 1):
            parts.append(cyl("cabin_log", 0.17, 6.6, (sx * 3.9, 0, zz + 0.16), logs, rot=(math.radians(90), 0, 0), segs=8))
    for sx in (-1, 1):
        parts.append(box("cabin_roof", (9.6, 4.4, 0.2), (0, sx * 1.9, 4.5), roof_m, rot=(-sx * math.radians(32), 0, 0)))
    parts.append(box("cabin_ridge", (9.6, 0.3, 0.3), (0, 0, 5.65), roof_m))
    parts.append(box("cabin_chimney", (0.8, 0.8, 3.0), (3.0, -1.2, 5.0), stone))
    for wx in (-2, 2):
        parts.append(box("cabin_window", (1.2, 0.1, 1.0), (wx, 3.06, 2.0), window_m))
    parts.append(box("cabin_door", (1.0, 0.1, 2.0), (0, 3.06, 1.4), plank))
    parts.append(box("cabin_porch", (8.6, 2.2, 0.2), (0, 4.1, 0.4), plank))
    place(parts, (x, y, z), a + math.pi / 2)
    # Dock running out from the beach in front of the cabin.
    dx, dy = -math.cos(a), -math.sin(a)
    start = shore_r(a) + 3
    for j in range(16):
        r = start - j * 1.0
        box("dock_plank", (2.4, 0.9, 0.08), (r * math.cos(a), r * math.sin(a), 1.0), plank, rot=(0, 0, a + math.pi / 2))
    for j in range(0, 16, 3):
        r = start - j
        for s in (-1, 1):
            px, py = r * math.cos(a) + s * 1.1 * -math.sin(a), r * math.sin(a) + s * 1.1 * math.cos(a)
            cyl("dock_post", 0.1, 5.0, (px, py, -1.3), post_m, segs=6)
    if k % 2 == 0:
        r = start - 10
        boat("dock_boat", (r * math.cos(a) + 2.6 * -math.sin(a), r * math.sin(a) + 2.6 * math.cos(a), -0.05), math.degrees(a), 5.0,
             random.choice([(0.9, 0.9, 0.92), (0.2, 0.25, 0.55)]))
    # Campfire and benches beside the cabin.
    fx, fy = x + math.cos(a + 0.6) * 9, y + math.sin(a + 0.6) * 9
    fz = height(fx, fy)
    for j in range(8):
        aa = j * math.tau / 8
        blob("fire_stone", 0.25, (fx + math.cos(aa) * 0.9, fy + math.sin(aa) * 0.9, fz), cliff, jitter=0.2)
    cyl("fire_ember", 0.4, 0.05, (fx, fy, fz + 0.05), surf("lamp_fire", (1.0, 0.4, 0.05), emission=(1.0, 0.35, 0.05), strength=4.0), segs=10)

# ---------------------------------------------------------------- forest, beach reeds, rocks


def clear_of_features(x, y):
    if abs(x) < 8 and y < -200:
        return False
    if abs(x - rx) < 30 and abs(y - ry) < 30:
        return False
    if math.hypot(x - bx, y - by) < 18:
        return False
    return all(math.hypot(x - cx, y - cy) > 14 for cx, cy in cabins)


placed = tries = 0
while placed < 520 and tries < 9000:
    tries += 1
    x, y = random.uniform(-440, 440), random.uniform(-440, 440)
    z = height(x, y)
    if z < 2.8 or z > 90 or not clear_of_features(x, y):
        continue
    slope = abs(height(x + 3, y) - z) + abs(height(x, y + 3) - z)
    if slope > 4.5:
        continue
    kind = "pine" if z > 25 or random.random() < 0.55 else "round"
    tree("tree", (x, y, z - 0.3), random.uniform(9, 18) if kind == "pine" else random.uniform(7, 12), kind)
    placed += 1

for k in range(70):
    deg = random.uniform(-180, 180)
    x, y, a = shore_point(deg, random.uniform(-6, 2))
    if not clear_of_features(x, y):
        continue
    grass_tufts("reeds", (x, y, max(height(x, y), -0.2)), random.uniform(2, 4), random.randint(20, 40), tuft_m)
for k in range(40):
    deg = random.uniform(-180, 180)
    x, y, a = shore_point(deg, random.uniform(-14, -3))
    if clear_of_features(x, y):
        rock("shore_rock", (x, y, height(x, y)), random.uniform(0.6, 2.2), cliff)

empty("spawn", (0, PY1 + 2, pz + 0.06), 0)
print(finish_map("public/models/maps/lake.glb"))
