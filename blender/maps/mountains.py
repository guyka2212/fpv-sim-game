# Long-range valley: 1.8 km of mountain terrain with a winding valley, a lake, pine forest,
# snowy peaks, a cabin and a launch platform.
exec(open(r"C:\Users\User\Documents\fly-sim\blender\lib.py").read())
exec(open(r"C:\Users\User\Documents\fly-sim\blender\maplib.py").read())
exec(open(r"C:\Users\User\Documents\fly-sim\blender\detail.py").read())
from mathutils import noise
clear_scene()
random.seed(5)

grass = surf("grass_alpine", (0.24, 0.4, 0.14))
rock = surf("rock_mountain", (0.4, 0.38, 0.36), rough=0.95)
snow = surf("snow_peak", (0.92, 0.93, 0.96), rough=0.7)
sand = surf("dirt_shore", (0.5, 0.44, 0.33))
water = surf("water_lake", (0.06, 0.2, 0.28), rough=0.04, metallic=0.2)
trunk = surf("wood_bark", (0.25, 0.16, 0.09))
pine = surf("leaves_pine", (0.08, 0.24, 0.1))
plank = surf("wood_planks", (0.5, 0.36, 0.22))
roof_m = surf("roof_metal", (0.35, 0.12, 0.1), metallic=0.5, rough=0.5)

SIZE = 1800.0
SEG = 180
WATER = 12.0


def height(x, y):
    # Winding valley along X; mountains rise with distance from it.
    river_y = 120 * math.sin(x / 260.0) + 60 * math.sin(x / 97.0 + 1.3)
    d = abs(y - river_y)
    v = min(1.0, max(0.0, (d - 40) / 520.0))
    v = v * v * (3 - 2 * v)
    n = noise.fractal(Vector((x / 380.0, y / 380.0, 0.3)), 0.5, 2.1, 5, noise_basis="PERLIN_ORIGINAL")
    ridge = noise.ridged_multi_fractal(Vector((x / 520.0, y / 520.0, 1.7)), 0.9, 2.0, 4, 1.0, 2.0, noise_basis="PERLIN_ORIGINAL")
    h = 16 + v * (110 + 100 * ridge) + 10 * n + v * 35 * n
    # Lake basin in the middle of the valley.
    lake = math.hypot(x - 60, (y - river_y) * 1.4)
    if lake < 220:
        t = lake / 220.0
        h = h * t * t + (WATER - 6) * (1 - t * t)
    # Raise the outer rim so the map ends in walls of rock.
    edge = max(abs(x), abs(y)) / (SIZE / 2)
    if edge > 0.8:
        h += ((edge - 0.8) / 0.2) ** 2 * 160
    return h


bm = bmesh.new()
bmesh.ops.create_grid(bm, x_segments=SEG, y_segments=SEG, size=1.0)
xs = [v.co.x for v in bm.verts]
half = max(xs)
scale = (SIZE / 2) / half
for v in bm.verts:
    x, y = v.co.x * scale, v.co.y * scale
    v.co = Vector((x, y, height(x, y)))
bm.normal_update()
terrain = _obj_from_bm("terrain", bm, grass)
me = terrain.data
for m in (rock, snow, sand):
    me.materials.append(m)
for p in me.polygons:
    z = p.center.z
    steep = p.normal.z < 0.66
    if z < WATER + 2.5:
        p.material_index = 3
    elif z > 185 + 20 * math.sin(p.center.x / 50.0):
        p.material_index = 2 if p.normal.z > 0.55 else 1
    elif steep:
        p.material_index = 1
    p.use_smooth = True

cyl("lake", 260, 0.2, (60, 120 * math.sin(60 / 260.0) + 60 * math.sin(60 / 97.0 + 1.3), WATER), water, segs=48)


def ground(x, y):
    return height(x, y)


# Pine forest on moderate slopes between the shore and the tree line.
placed = 0
tries = 0
while placed < 520 and tries < 6000:
    tries += 1
    x, y = random.uniform(-780, 780), random.uniform(-780, 780)
    z = ground(x, y)
    if z < WATER + 3 or z > 150:
        continue
    slope = abs(ground(x + 3, y) - z) + abs(ground(x, y + 3) - z)
    if slope > 4.2:
        continue
    tree("pine", (x, y, z - 0.3), random.uniform(9, 20), "pine", trunk, pine)
    placed += 1

# Boulders.
for _ in range(70):
    x, y = random.uniform(-700, 700), random.uniform(-700, 700)
    z = ground(x, y)
    if z < WATER:
        continue
    s = random.uniform(1.5, 6)
    blob("boulder", s, (x, y, z + s * 0.2), rock, scale=(1.2, 1, 0.7), subdiv=1, jitter=0.3)
    for k in range(random.randint(0, 3)):
        blob("boulder", s * 0.4, (x + random.uniform(-1.5, 1.5) * s, y + random.uniform(-1.5, 1.5) * s, z), rock, scale=(1, 1, 0.6), jitter=0.3)

# Launch platform and cabin on the valley floor, west of the lake.
lx, ly = -260.0, 0.0
ly = 120 * math.sin(lx / 260.0) + 60 * math.sin(lx / 97.0 + 1.3)
lz = max(ground(lx + dx, ly + dy) for dx in (-4, 0, 4) for dy in (-4, 0, 4)) + 0.6
box("launch_deck", (6, 6, 0.3), (lx, ly, lz), plank)
for sx in (-1, 1):
    for sy in (-1, 1):
        box("deck_leg", (0.25, 0.25, 6), (lx + sx * 2.7, ly + sy * 2.7, lz - 3), plank)
cx, cy = lx + 25, ly + 18
cz = ground(cx, cy)
box("cabin_base", (8.6, 6.6, 1.2), (cx, cy, cz - 0.3), rock)
for k in range(9):
    # Log walls: stacked rounded logs with overhanging ends.
    z = cz + 0.45 + k * 0.33
    for sy in (-1, 1):
        cyl("log", 0.17, 8.8, (cx, cy + sy * 2.9, z), plank, rot=(0, math.radians(90), 0), segs=8)
    for sx in (-1, 1):
        cyl("log", 0.17, 6.6, (cx + sx * 3.9, cy, z + 0.16), plank, rot=(math.radians(90), 0, 0), segs=8)
glass_c = surf("window_cabin", (0.3, 0.4, 0.45), rough=0.08, metallic=0.5)
for wx_ in (-2, 2):
    box("cabin_window", (1.2, 0.1, 1.0), (cx + wx_, cy - 3.05, cz + 1.9), glass_c)
    box("cabin_window_frame", (1.4, 0.12, 0.12), (cx + wx_, cy - 3.06, cz + 2.45), surf("wood_trim", (0.85, 0.82, 0.75)))
box("cabin_door", (1.0, 0.1, 2.0), (cx, cy - 3.05, cz + 1.4), surf("wood_door", (0.35, 0.2, 0.12)))
for sy in (-1, 1):
    box("cabin_roof", (9.6, 4.4, 0.2), (cx, cy + sy * 1.9, cz + 4.4), roof_m, rot=(sy * math.radians(32), 0, 0))
box("cabin_ridge", (9.6, 0.3, 0.3), (cx, cy, cz + 5.55), roof_m)
box("chimney", (0.8, 0.8, 3.0), (cx + 3, cy + 1.2, cz + 5.0), rock)
box("porch", (8.6, 2.2, 0.2), (cx, cy - 4.1, cz + 0.3), plank)
for k in range(5):
    cyl("porch_post", 0.08, 2.4, (cx - 4 + k * 2, cy - 5.1, cz + 1.5), plank, segs=8)
box("porch_roof", (8.8, 2.6, 0.15), (cx, cy - 4.2, cz + 2.75), roof_m, rot=(math.radians(-10), 0, 0))
# Campsite: tents, a fire ring with logs, a picnic table.
fx, fy = cx - 14, cy - 8
fz = ground(fx, fy)
for k in range(8):
    a = k * math.tau / 8
    blob("fire_stone", 0.25, (fx + math.cos(a) * 0.9, fy + math.sin(a) * 0.9, fz), rock, jitter=0.2)
for k in range(3):
    cyl("fire_log", 0.08, 1.2, (fx, fy, fz + 0.15), plank, rot=(math.radians(80), 0, k * 1.05), segs=6)
cyl("ember", 0.4, 0.05, (fx, fy, fz + 0.05), surf("lamp_fire", (1.0, 0.4, 0.05), emission=(1.0, 0.35, 0.05), strength=4.0), segs=10)
for k, (tx, ty, col) in enumerate(((fx + 6, fy + 2, (1.0, 0.45, 0.05)), (fx + 5, fy - 4, (0.1, 0.45, 0.25)))):
    tz = ground(tx, ty)
    t = cyl("tent", 1.6, 1.5, (tx, ty, tz + 0.75), surf("fabric_tent_%d" % k, col, rough=0.8), r2=0.05, segs=4, smooth=False)
    t.rotation_euler = (0, 0, math.radians(45 + k * 20))
    t.scale = (1.3, 0.8, 1)
for k in range(4):
    a = k * math.tau / 4 + 0.4
    cyl("seat_log", 0.2, 1.4, (fx + math.cos(a) * 2.2, fy + math.sin(a) * 2.2, fz + 0.2), plank, rot=(0, math.radians(90), a + math.pi / 2), segs=8)

# A few gap features to fly through: natural rock arches built from stacked boulders.
for k, (ax, ay) in enumerate([(320, -40), (-520, 130), (120, 380)]):
    az = ground(ax, ay)
    ca, sa = math.cos(k), math.sin(k)
    for t in range(13):
        ang = math.pi * t / 12
        # Semicircle: 9 m radius, 7 m off the ground at the base.
        u = -9 * math.cos(ang)
        v = 9 * math.sin(ang) + (az + 1.5)
        r = 3.4 if t in (0, 12) else 2.6
        blob("arch_rock", r, (ax + ca * u, ay + sa * u, v + (0 if 0 < t < 12 else 0)), rock, scale=(1.1, 1.2, 1.0), jitter=0.25)
    for sx in (-1, 1):
        for h_ in (0, 2.5):
            blob("arch_foot", 3.8, (ax + ca * sx * 9.5, ay + sa * sx * 9.5, az + h_), rock, scale=(1.2, 1.2, 0.8), jitter=0.25)

# Meadow detail along the valley floor: grass tufts, wildflowers, fallen logs, rocks.
flowers = [surf("paint_flower_%d" % i, c, rough=0.6) for i, c in enumerate([(0.95, 0.85, 0.2), (0.9, 0.35, 0.6), (0.95, 0.95, 0.95), (0.45, 0.4, 0.9)])]
tuft_m = surf("grass_tuft", (0.28, 0.48, 0.16))
for k in range(220):
    x = random.uniform(-800, 800)
    ry = 120 * math.sin(x / 260.0) + 60 * math.sin(x / 97.0 + 1.3)
    y = ry + random.uniform(-90, 90)
    z = ground(x, y)
    if z < WATER + 1.5 or z > 120:
        continue
    grass_tufts("tufts", (x, y, z - 0.05), random.uniform(2, 6), random.randint(15, 45), tuft_m)
    if random.random() < 0.5:
        for f in range(random.randint(3, 9)):
            fx_, fy_ = x + random.uniform(-4, 4), y + random.uniform(-4, 4)
            blob("flower", 0.09, (fx_, fy_, ground(fx_, fy_) + 0.25), random.choice(flowers), subdiv=1, jitter=0.1)
    if random.random() < 0.08:
        cyl("fallen_log", 0.35, random.uniform(5, 9), (x, y, z + 0.25), trunk, rot=(0, math.radians(90), random.uniform(0, math.pi)), segs=8)
    if random.random() < 0.3:
        blob("rock_small", random.uniform(0.3, 1.0), (x + 3, y, z), rock, scale=(1.2, 1, 0.6), jitter=0.3)
# A jetty on the lake shore near the launch site.
lake_x, lake_y = 60, 120 * math.sin(60 / 260.0) + 60 * math.sin(60 / 97.0 + 1.3)
jx, jy = lake_x - 250, lake_y
for k in range(12):
    box("jetty_plank", (2.4, 0.9, 0.08), (jx + k * 0.95, jy, WATER + 0.9), plank)
for k in range(0, 12, 3):
    for sy in (-1, 1):
        cyl("jetty_post", 0.1, 3.0, (jx + k * 0.95, jy + sy * 1.1, WATER - 0.4), trunk, segs=6)

empty("spawn", (lx, ly, lz + 0.16), -90)
print(finish_map("public/models/maps/mountains.glb"))
