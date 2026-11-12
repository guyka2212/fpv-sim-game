# Cinewhoop town: street grid with mixed buildings, a central park with a pond,
# a church tower, parked cars, street lamps and trees.
exec(open(r"C:\Users\User\Documents\fly-sim\blender\lib.py").read())
exec(open(r"C:\Users\User\Documents\fly-sim\blender\maplib.py").read())
exec(open(r"C:\Users\User\Documents\fly-sim\blender\detail.py").read())
clear_scene()
random.seed(21)

asphalt = surf("asphalt_road", (0.12, 0.12, 0.13), rough=0.9)
sidewalk = surf("concrete_sidewalk", (0.6, 0.59, 0.56), rough=0.85)
grass = surf("grass_park", (0.22, 0.48, 0.15))
water = surf("water_pond", (0.08, 0.22, 0.3), rough=0.05, metallic=0.2)
trunk = surf("wood_bark", (0.25, 0.16, 0.09))
leaves = [surf("leaves_green", (0.12, 0.35, 0.08)), surf("leaves_autumn", (0.6, 0.35, 0.08))]
lamp_m = surf("metal_dark", (0.12, 0.12, 0.13), metallic=0.8, rough=0.4)
glow = surf("lamp_glow", (1.0, 0.95, 0.8), emission=(1.0, 0.9, 0.7), strength=3.0)
roof_m = surf("roof_tiles", (0.45, 0.18, 0.12), rough=0.8)
glass_b = surf("window_building", (0.25, 0.35, 0.45), rough=0.1, metallic=0.5)
stripe = surf("paint_road", (0.95, 0.95, 0.9), rough=0.6)
facades = [surf("brick_red", (0.55, 0.25, 0.18)), surf("plaster_cream", (0.85, 0.78, 0.62)), surf("plaster_blue", (0.45, 0.58, 0.68)),
           surf("concrete_grey", (0.55, 0.55, 0.55)), surf("plaster_ochre", (0.78, 0.6, 0.32)), surf("brick_brown", (0.4, 0.28, 0.2))]
church_m = surf("stone_church", (0.62, 0.6, 0.55))
bench_m = surf("wood_bench", (0.5, 0.33, 0.18))
frames = [surf("concrete_frame", (0.86, 0.85, 0.82)), surf("metal_frame", (0.18, 0.19, 0.2), metallic=0.6, rough=0.4),
          surf("stone_frame", (0.72, 0.68, 0.6))]
kerb = surf("concrete_kerb", (0.7, 0.7, 0.68))
path_m = surf("tile_path", (0.66, 0.6, 0.52), rough=0.6)

SIZE = 260
box("ground", (SIZE + 120, SIZE + 120, 0.2), (0, 0, -0.1), grass)

BLOCK, ROAD, WALK = 50.0, 10.0, 3.0
pitch = BLOCK + ROAD
n = 4
start = -pitch * n / 2 + ROAD / 2
# Roads (grid) and centre lines.
for k in range(n + 1):
    c = -pitch * n / 2 + k * pitch
    box("road", (SIZE, ROAD, 0.04), (0, c, 0.02), asphalt)
    box("road", (ROAD, SIZE, 0.04), (c, 0, 0.021), asphalt)
    for d in range(-12, 13):
        box("stripe", (3, 0.15, 0.01), (d * 10 + 5, c, 0.045), stripe)
        box("stripe", (0.15, 3, 0.01), (c, d * 10 + 5, 0.046), stripe)

for k in range(n + 1):
    for j in range(n + 1):
        ix = -pitch * n / 2 + k * pitch
        iy = -pitch * n / 2 + j * pitch
        for d in (-1, 1):
            for z in range(6):
                box("zebra", (0.5, 3.0, 0.01), (ix - 2.5 + z * 1.0, iy + d * (ROAD / 2 + 2.0), 0.047), stripe)
                box("zebra", (3.0, 0.5, 0.01), (ix + d * (ROAD / 2 + 2.0), iy - 2.5 + z * 1.0, 0.048), stripe)

blocks = []
for i in range(n):
    for j in range(n):
        cx = -pitch * n / 2 + ROAD / 2 + BLOCK / 2 + i * pitch
        cy = -pitch * n / 2 + ROAD / 2 + BLOCK / 2 + j * pitch
        blocks.append((i, j, cx, cy))
        box("sidewalk", (BLOCK, BLOCK, 0.18), (cx, cy, 0.09), sidewalk)
        for sgn in (-1, 1):
            box("kerb", (BLOCK, 0.25, 0.2), (cx, cy + sgn * (BLOCK / 2 - 0.12), 0.1), kerb)
            box("kerb", (0.25, BLOCK, 0.2), (cx + sgn * (BLOCK / 2 - 0.12), cy, 0.1), kerb)


def building(x, y, w, d, h, wall_m):
    box("building", (w, d, h), (x, y, h / 2), wall_m)
    # Framed window grid on all four sides; a shopfront band on taller buildings.
    frame = random.choice(frames)
    facade(x, y, w, d, h, 3.2, frame, glass_b, bay=random.choice([2.6, 3.2, 4.0]))
    if h >= 14:
        box("awning", (w * 0.7, 1.2, 0.12), (x, y - d / 2 - 0.6, 3.2), random.choice([roof_m, lamp_m, frames[1]]))
    if h < 14 and random.random() < 0.6:
        r = cyl("roof", max(w, d) * 0.72, 3.0, (x, y, h + 1.5), roof_m, r2=0.3, segs=4, smooth=False)
        r.rotation_euler = (0, 0, math.radians(45))
        r.scale = (w / max(w, d), d / max(w, d), 1)
    else:
        rooftop_kit(x, y, w, d, h + 0.45)


for i, j, cx, cy in blocks:
    if (i, j) in ((1, 1), (2, 2), (1, 2)):
        continue
    if (i, j) == (2, 1):
        # Church: nave + bell tower with an open belfry to fly through.
        box("nave", (14, 30, 12), (cx, cy - 4, 6), church_m)
        r = cyl("nave_roof", 12, 7, (cx, cy - 4, 15.5), roof_m, r2=0.3, segs=4, smooth=False)
        r.rotation_euler = (0, 0, math.radians(45))
        r.scale = (0.62, 1.4, 1)
        tx, ty = cx, cy + 15
        box("tower", (7, 7, 22), (tx, ty, 11), church_m)
        for sx in (-1, 1):
            for sy in (-1, 1):
                box("belfry_post", (1.2, 1.2, 6), (tx + sx * 2.9, ty + sy * 2.9, 25), church_m)
        box("belfry_top", (7.4, 7.4, 1), (tx, ty, 28.5), church_m)
        cyl("spire", 4.9, 12, (tx, ty, 35), roof_m, r2=0.0, segs=4, smooth=False).rotation_euler = (0, 0, math.radians(45))
        continue
    # Fill the block perimeter with buildings, leaving a courtyard.
    # The south and north rows run corner to corner; east and west fit between them, so no two
    # buildings ever share the corner.
    for side in range(4):
        end = BLOCK / 2 - 3 if side in (0, 2) else BLOCK / 2 - 3 - 14.6
        along = -end
        while along < end - 5:
            w = random.uniform(9, 16)
            w = min(w, end - along)
            if w < 6:
                break
            d = random.uniform(10, 14)
            h = random.choice([7, 9, 10, 12, 15, 18, 22, 28]) * (1.4 if (i + j) % 3 == 0 else 1)
            mid = along + w / 2
            off = BLOCK / 2 - 3 - d / 2
            if side == 0:
                bx, by, bw, bd = cx + mid, cy - off, w, d
            elif side == 1:
                bx, by, bw, bd = cx + off, cy + mid, d, w
            elif side == 2:
                bx, by, bw, bd = cx - mid, cy + off, w, d
            else:
                bx, by, bw, bd = cx - off, cy - mid, d, w
            building(bx, by, bw - 0.6, bd, h, random.choice(facades))
            along += w + random.choice([0.0, 0.0, 3.0])

# Central park across blocks (1,1),(1,2),(2,2): grass, pond, trees, benches, gazebo.
pcx = -pitch * n / 2 + ROAD / 2 + BLOCK / 2 + 1 * pitch
pcy = -pitch * n / 2 + ROAD / 2 + BLOCK / 2 + 2 * pitch
POND_R = 14.0


def dry(x, y, margin=1.5):
    """Outside the pond and its rim."""
    return math.hypot(x - pcx, y - pcy) > POND_R + margin


for i, j in ((1, 1), (1, 2), (2, 2)):
    cx = -pitch * n / 2 + ROAD / 2 + BLOCK / 2 + i * pitch
    cy = -pitch * n / 2 + ROAD / 2 + BLOCK / 2 + j * pitch
    box("park_lawn", (BLOCK - 4, BLOCK - 4, 0.2), (cx, cy, 0.1), grass)
    # Cross paths with benches and lamps, trees and flower beds in the quarters; the pond block
    # has a path ring around the water instead of the cross.
    if dry(cx, cy, 0):
        box("park_path", (BLOCK - 4, 3.0, 0.02), (cx, cy, 0.21), path_m)
        box("park_path", (3.0, BLOCK - 4, 0.025), (cx, cy, 0.2125), path_m)
    else:
        ring("park_path", POND_R + 1.0, POND_R + 4.0, 0.02, (cx, cy, 0.21), path_m, segs=48)
        for k in range(4):
            a_ = k * math.pi / 2
            x_, y_ = cx + math.cos(a_) * (POND_R + 4 + (BLOCK / 2 - 2 - POND_R - 4) / 2), cy + math.sin(a_) * (POND_R + 4 + (BLOCK / 2 - 2 - POND_R - 4) / 2)
            box("park_path", (3.0, BLOCK / 2 - 2 - POND_R - 3.9, 0.025), (x_, y_, 0.2125), path_m, rot=(0, 0, a_ + math.pi / 2))
    for k in (-1, 1):
        for bx_, by_, yaw in ((cx + k * 9, cy + 2.2, 0), (cx - 2.2, cy + k * 9, 90)):
            if dry(bx_, by_):
                bench((bx_, by_, 0.2), yaw)
            else:
                # Benches face the water from the path ring.
                a_ = math.atan2(by_ - cy, bx_ - cx)
                bench((cx + math.cos(a_) * (POND_R + 5.0), cy + math.sin(a_) * (POND_R + 5.0), 0.2), math.degrees(a_) + 90)
        if dry(cx + k * 15, cy - 2.0):
            street_lamp((cx + k * 15, cy - 2.0, 0.2), 90, h=4.5)
        if dry(cx + k * 6, cy - 2.0):
            bin_((cx + k * 6, cy - 2.0, 0.2))
    k = 0
    while k < 16:
        qx = random.choice((-1, 1)) * random.uniform(4, 20)
        qy = random.choice((-1, 1)) * random.uniform(4, 20)
        h_ = random.uniform(6, 13)
        if dry(cx + qx, cy + qy, 4 + h_ * 0.25):
            tree("tree", (cx + qx, cy + qy, 0.2), h_, random.choice(["round", "round", "pine"]))
        k += 1
    for k in range(10):
        qx = random.choice((-1, 1)) * random.uniform(4, 21)
        qy = random.choice((-1, 1)) * random.uniform(4, 21)
        if dry(cx + qx, cy + qy, 2.5):
            bush("bush", (cx + qx, cy + qy, 0.2), random.uniform(0.6, 1.2))
    grass_tufts("tufts", (cx, cy, 0.2), 21, 220, grass, avoid=((pcx - POND_R - 1.5, pcx + POND_R + 1.5, pcy - POND_R - 1.5, pcy + POND_R + 1.5),))
cyl("pond", POND_R, 0.1, (pcx, pcy, 0.17), water, segs=48)
ring("pond_rim", POND_R - 0.2, POND_R + 1.0, 0.35, (pcx, pcy, 0.2), surf("stone_rim", (0.6, 0.58, 0.55)), segs=48)
gx, gy = pcx + 60, pcy
cyl("gazebo_floor", 4, 0.3, (gx, gy, 0.35), bench_m, segs=8, smooth=False)
for k in range(8):
    a = k * math.tau / 8
    cyl("gazebo_post", 0.12, 3, (gx + math.cos(a) * 3.6, gy + math.sin(a) * 3.6, 2), surf("paint_white", (0.92, 0.92, 0.9)), segs=6)
cyl("gazebo_roof", 4.6, 2, (gx, gy, 4.5), roof_m, r2=0.2, segs=8, smooth=False)

# Street furniture: lamps along roads, parked cars.
car_cols = [(0.7, 0.05, 0.05), (0.05, 0.15, 0.5), (0.85, 0.85, 0.85), (0.1, 0.1, 0.1), (0.3, 0.5, 0.3), (0.9, 0.6, 0.1)]
for k in range(n + 1):
    c = -pitch * n / 2 + k * pitch
    for d in range(-6, 7):
        p = d * 20
        if random.random() < 0.8:
            street_lamp((p, c + ROAD / 2 + 0.8, 0.18), -90)
        if random.random() < 0.35:
            tree("street_tree", (p + 10, c + ROAD / 2 + 1.6, 0.18), random.uniform(6, 9), "round")
        elif random.random() < 0.3:
            bench((p + 10, c + ROAD / 2 + 1.4, 0.18), 180)
            bin_((p + 12, c + ROAD / 2 + 1.0, 0.18))
        if random.random() < 0.2:
            bollard((p + 4, c - ROAD / 2 - 0.6, 0.18))
        if random.random() < 0.45:
            car("car_%d_%d" % (k, d), (p + 7, c - ROAD / 2 + 1.6, 0.04), 90 if random.random() < 0.5 else -90, random.choice(car_cols))
        if random.random() < 0.3:
            car("car_v_%d_%d" % (k, d), (c + ROAD / 2 - 1.6, p + 7, 0.04), 0, random.choice(car_cols))

empty("spawn", (pcx + 18, pcy - 18, 0.21), 45)
print(finish_map("public/models/maps/town.glb"))
