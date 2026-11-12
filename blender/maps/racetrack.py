# MultiGP-style race field: 12 gates on an oval with a dive gate, a ladder and hurdles.
exec(open(r"C:\Users\User\Documents\fly-sim\blender\lib.py").read())
exec(open(r"C:\Users\User\Documents\fly-sim\blender\maplib.py").read())
exec(open(r"C:\Users\User\Documents\fly-sim\blender\detail.py").read())
clear_scene()
random.seed(7)

grass = surf("grass_field", (0.18, 0.42, 0.12))
dirt = surf("dirt_pad", (0.36, 0.27, 0.17))
orange = surf("fabric_orange", (1.0, 0.35, 0.02), rough=0.7)
black = surf("fabric_black", (0.03, 0.03, 0.03), rough=0.7)
white = surf("fabric_white", (0.92, 0.92, 0.92), rough=0.7)
blue = surf("fabric_blue", (0.05, 0.2, 0.9), rough=0.7)
pole = surf("metal_pole", (0.7, 0.7, 0.72), metallic=0.9, rough=0.35)
trunk = surf("wood_bark", (0.25, 0.16, 0.09))
leaves = surf("leaves_green", (0.12, 0.33, 0.08))
tent_m = surf("fabric_tent", (0.85, 0.1, 0.1), rough=0.6)
plank = surf("wood_planks", (0.55, 0.42, 0.28))

box("ground", (260, 200, 0.2), (0, 0, -0.1), grass)
box("start_pad", (14, 10, 0.04), (-58, -12, 0.02), dirt)

N = 12
pts = []
for i in range(N):
    th = math.pi - math.tau * i / N
    r = 1 + 0.14 * math.sin(3 * th)
    pts.append((58 * r * math.cos(th), 36 * r * math.sin(th)))

for i, (x, y) in enumerate(pts):
    px, py = pts[i - 1]
    nx, ny = pts[(i + 1) % N]
    dx, dy = nx - px, ny - py
    yaw = math.degrees(math.atan2(-dx, dy))
    nm = "gate_%02d" % (i + 1)
    mats = {"a": orange if i % 2 == 0 else blue, "b": black, "pole": pole}
    if i == 4:
        # Dive gate on a tower: fly over and drop through it.
        gate_frame(nm, (x, y, 5.0), yaw, mats=mats, dive=True, inner_h=1.8, inner_w=1.8)
    elif i == 8:
        # Ladder: the second gate stacked on top of a lower one; race line goes through the top.
        gate_frame(nm + "_low", (x, y, 0), yaw, mats={"a": white, "b": black})
        bpy.data.objects.remove(bpy.data.objects[nm + "_low_marker"])
        gate_frame(nm, (x, y, 0), yaw, mats=mats, z_bottom=1.9)
    elif i in (2, 10):
        gate_frame(nm, (x, y, 0), yaw, mats=mats, z_bottom=1.4)
    else:
        gate_frame(nm, (x, y, 0), yaw, mats=mats)
    # Flags between gates.
    fx, fy = (x + nx) / 2, (y + ny) / 2
    side = 1 if i % 2 else -1
    nlen = math.hypot(dx, dy)
    ox, oy = -dy / nlen * 4 * side, dx / nlen * 4 * side
    if i not in (4, 8):
        cyl("flag_pole", 0.03, 3.2, (fx + ox, fy + oy, 1.6), pole, segs=6)
        box("flag", (0.02, 0.7, 2.2), (fx + ox, fy + oy + 0.35, 2.0), orange if i % 3 else white)
    # Hurdle every few gates.
    if i in (1, 6):
        hx, hy = (x + nx) / 2 - ox * 0.6, (y + ny) / 2 - oy * 0.6
        g, _ = gate_frame("hurdle_%d" % i, (hx, hy, 0), yaw, inner_w=2.4, inner_h=0.6, mats={"a": white, "b": white})

# ---- Detail pass: pit village, banner fencing, flags, cones, mown stripes, scrub.
mow = surf("grass_mown", (0.15, 0.37, 0.1))
for k in range(-6, 7):
    box("mow_stripe", (10, 190, 0.01), (k * 20, 0, 0.005), mow)
for k in range(5):
    parasol((-74 + (k % 2) * 4, -32 + k * 6, 0), random.choice([(1, 0.35, 0.02), (0.1, 0.3, 0.9), (0.95, 0.95, 0.95)]))
for k in range(4):
    crate((-66 + k * 1.3, -30, 0), 0.6)
    box("landing_mat", (1.2, 1.2, 0.03), (-50 + k * 2.0, -16, 0.035), blue if k % 2 else orange)
# Banner fence along the outside of the course.
for i in range(N):
    x, y = pts[i]
    nx, ny = pts[(i + 1) % N]
    mx, my = (x + nx) / 2 * 1.32, (y + ny) / 2 * 1.32
    a = math.degrees(math.atan2(ny - y, nx - x))
    for k in range(3):
        t = (k - 1) * 3.2
        bx_ = mx + math.cos(math.radians(a)) * t
        by_ = my + math.sin(math.radians(a)) * t
        box("banner_fence", (3.0, 0.03, 0.9), (bx_, by_, 0.6), random.choice([orange, blue, white, black]), rot=(0, 0, math.radians(a)))
        cyl("banner_post", 0.025, 1.1, (bx_ + math.cos(math.radians(a)) * 1.5, by_ + math.sin(math.radians(a)) * 1.5, 0.55), pole, segs=6)
for k in range(10):
    a = k * math.tau / 10
    flag((70 * math.cos(a) * 1.25, 46 * math.sin(a) * 1.25, 0), random.choice([(1, 0.35, 0.02), (0.05, 0.2, 0.9), (0.95, 0.95, 0.95)]), h=random.uniform(4, 6))
for i, (x, y) in enumerate(pts):
    for k in range(2):
        traffic_cone((x + random.uniform(-3, 3), y + random.uniform(-3, 3), 0))
for k in range(40):
    x, y = random.uniform(-120, 120), random.uniform(-90, 90)
    if (x / 75) ** 2 + (y / 50) ** 2 < 1.1:
        continue
    grass_tufts("tufts", (x, y, 0), random.uniform(2, 5), random.randint(20, 50), grass)
    if random.random() < 0.3:
        bush("bush", (x, y, 0), random.uniform(0.6, 1.3))

# Spawn on the pad just behind the start gate.
x0, y0 = pts[0]
empty("spawn", (x0, y0 - 9, 0.05), 0)

# Pit area: tents, a timing tower, bleachers.
for k in range(3):
    tx, ty = -72, -25 + k * 7
    top = cyl("tent_roof", 2.6, 1.0, (tx, ty, 2.6), tent_m, r2=0.0, segs=4, smooth=False)
    top.rotation_euler = (0, 0, math.radians(45))
    for sx in (-1, 1):
        for sy in (-1, 1):
            cyl("tent_leg", 0.04, 2.1, (tx + sx * 1.8, ty + sy * 1.8, 1.05), pole, segs=6)
    box("table", (2.0, 0.8, 0.05), (tx, ty, 0.75), white)
box("timing_tower", (2.2, 2.2, 6), (-66, 10, 3), white)
box("timing_board", (3.2, 0.2, 1.4), (-66, 8.8, 5.2), black)
for r in range(4):
    box("bleacher", (14, 1.0, 0.25), (-80 + r * 0.0, 30 + r * 1.0, 0.4 + r * 0.45), plank)

# Tree line around the field.
for k in range(70):
    a = random.uniform(0, math.tau)
    rx, ry = 105 + random.uniform(-6, 10), 80 + random.uniform(-6, 10)
    x, y = rx * math.cos(a), ry * math.sin(a)
    tree("tree", (x, y, 0), random.uniform(8, 15), random.choice(["round", "pine"]), trunk, leaves)

print(finish_map("public/models/maps/racetrack.glb"))
