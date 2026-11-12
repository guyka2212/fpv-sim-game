# Freestyle spot: a three-storey abandoned concrete building ("bando"), a skate park,
# stacked shipping containers and a water tower on a dusty lot.
exec(open(r"C:\Users\User\Documents\fly-sim\blender\lib.py").read())
exec(open(r"C:\Users\User\Documents\fly-sim\blender\maplib.py").read())
exec(open(r"C:\Users\User\Documents\fly-sim\blender\detail.py").read())
clear_scene()
random.seed(3)

dirt = surf("dirt_lot", (0.38, 0.33, 0.25))
grass = surf("grass_dry", (0.35, 0.38, 0.18))
concrete = surf("concrete_old", (0.52, 0.5, 0.47))
concrete_dark = surf("concrete_dark", (0.33, 0.32, 0.3))
skate = surf("concrete_skate", (0.68, 0.67, 0.64), rough=0.6)
rust = surf("metal_rust", (0.45, 0.2, 0.08), metallic=0.4, rough=0.8)
steel = surf("metal_pole", (0.6, 0.6, 0.62), metallic=0.9, rough=0.35)
graffiti = [surf("paint_graf%d" % i, c, rough=0.6) for i, c in enumerate([(0.9, 0.1, 0.5), (0.1, 0.7, 0.9), (0.95, 0.8, 0.1), (0.3, 0.9, 0.3)])]
container_cols = [(0.7, 0.15, 0.1), (0.1, 0.3, 0.6), (0.15, 0.45, 0.2), (0.85, 0.55, 0.1)]
trunk = surf("wood_bark", (0.25, 0.18, 0.12))
dead = surf("leaves_dry", (0.32, 0.28, 0.15))

def graffiti_piece(center, normal_axis, sign, w, h, color):
    """Irregular bubble-shaped tag: a filled blob row with a dark outline, flat on a wall."""
    outline = surf("paint_graf_outline", (0.05, 0.05, 0.06), rough=0.6)
    cx, cy, cz = center
    letters = max(2, int(w / 0.9))
    for li in range(letters):
        lc = -w / 2 + (li + 0.5) * w / letters
        lift = random.uniform(-0.15, 0.15) * h
        for layer, (mat_, grow, off) in enumerate(((outline, 1.15, 0.0), (color, 1.0, 0.012))):
            bm = bmesh.new()
            k = 11
            verts = []
            rx, rz = w / letters * 0.8 * grow, h * 0.5 * grow * random.uniform(0.85, 1.1)
            for i in range(k):
                a = i * math.tau / k
                r = random.uniform(0.75, 1.0)
                u, v = lc + math.cos(a) * rx * r, lift + math.sin(a) * rz * r
                d = sign * (0.13 + off + layer * 0.004)
                if normal_axis == "y":
                    verts.append(bm.verts.new((cx + u, cy + d, cz + v)))
                else:
                    verts.append(bm.verts.new((cx + d, cy + u, cz + v)))
            bm.faces.new(verts)
            _obj_from_bm("graffiti", bm, mat_)


box("ground", (240, 240, 0.2), (0, 0, -0.1), dirt)
for _ in range(14):
    box("grass_patch", (random.uniform(10, 30), random.uniform(10, 30), 0.03), (random.uniform(-100, 100), random.uniform(-100, 100), 0.015), grass)

# ---- The bando: 36 x 22 m, 3 floors of 3.6 m, column grid, broken slabs, partial walls.
BX, BY, FH = 36.0, 22.0, 3.6
ox, oy = 10.0, 20.0
for f in range(4):
    z = f * FH
    if f == 0:
        box("slab", (BX, BY, 0.3), (ox, oy, 0.15), concrete_dark)
        continue
    # Slab with a hole (missing section) on alternating sides.
    hole_x = -8 if f % 2 else 8
    if f == 3:
        # Roof: only half remains.
        box("slab", (BX / 2, BY, 0.3), (ox - BX / 4, oy, z), concrete)
    else:
        # Two slab halves with an 8 m gap, half of the gap still bridged.
        left_w = BX / 2 + hole_x - 4
        box("slab", (left_w, BY, 0.3), (ox - BX / 2 + left_w / 2, oy, z), concrete)
        right_w = BX - left_w - 8
        box("slab", (right_w, BY, 0.3), (ox + BX / 2 - right_w / 2, oy, z), concrete)
        box("slab", (8, BY / 2, 0.3), (ox - BX / 2 + left_w + 4, oy - BY / 4, z), concrete)
for i in range(7):
    for j in range(4):
        x = ox - BX / 2 + 0.3 + i * (BX - 0.6) / 6
        y = oy - BY / 2 + 0.3 + j * (BY - 0.6) / 3
        floors = 3 if not (i > 3 and j == 0) else 2
        box("column", (0.5, 0.5, FH * floors), (x, y, FH * floors / 2), concrete)
# Outer walls with big window openings on floors 1 and 2, broken sections.
for f in range(3):
    z0 = f * FH + 0.15
    win = [(3 + k * 6, 3.0, 1.0, 2.8) for k in range(6)]
    door = [(9, 4.0, 0.0, 3.2)] if f == 0 else []
    for p0, p1, ops in (
        ((ox - BX / 2, oy - BY / 2), (ox + BX / 2, oy - BY / 2), (door + win[1:]) if f == 0 else win),
        ((ox - BX / 2, oy + BY / 2), (ox + BX / 2, oy + BY / 2), win[:4]),
        ((ox - BX / 2, oy - BY / 2), (ox - BX / 2, oy + BY / 2), [(5.5, 3, 1.0, 2.8), (11, 3, 1.0, 2.8), (16.5, 3, 1.0, 2.8)]),
    ):
        wall("wall", p0, p1, z0, FH - 0.3, 0.25, concrete, ops)
# East side is fully open: a big gap to fly through. Stairs core.
box("stair_core", (4, 5, FH * 3), (ox + 12, oy + 6, FH * 1.5), concrete_dark)
for k, c in enumerate(graffiti):
    graffiti_piece((ox - 12 + k * 7, oy - BY / 2, random.uniform(0.9, 1.6)), "y", -1, random.uniform(2.5, 4), random.uniform(1.0, 1.5), c)

# ---- Skate park on a concrete pad.
sx, sy = -35.0, -25.0
box("skate_pad", (34, 24, 0.12), (sx, sy, 0.06), skate)


def quarter_pipe(name, loc, yaw_deg, width=8, radius=2.4, segs=10):
    bm = bmesh.new()
    prof = [(0, 0)]
    for k in range(segs + 1):
        a = math.pi / 2 * k / segs
        prof.append((radius - radius * math.sin(a) + 0.3, radius - radius * math.cos(a)))
    prof.append((0, radius))
    verts_l = [bm.verts.new((-width / 2, p[0] - radius, p[1])) for p in prof]
    verts_r = [bm.verts.new((width / 2, p[0] - radius, p[1])) for p in prof]
    n = len(prof)
    for k in range(n):
        bm.faces.new((verts_l[k], verts_l[(k + 1) % n], verts_r[(k + 1) % n], verts_r[k]))
    bm.faces.new(verts_l[::-1])
    bm.faces.new(verts_r)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    o = _obj_from_bm(name, bm, skate, loc, (0, 0, math.radians(yaw_deg)))
    zero_origin(o)
    coping = cyl(name + "_coping", 0.05, width, (0, 0, 0), steel, rot=(0, math.radians(90), 0), segs=8)
    coping.location = loc
    coping.rotation_euler = (0, math.radians(90), math.radians(yaw_deg))
    return o


quarter_pipe("qp_n", (sx, sy + 10, 0.12), 180)
quarter_pipe("qp_s", (sx, sy - 10, 0.12), 0)
box("funbox", (6, 4, 0.9), (sx, sy, 0.57), skate, bevel=0.05)
for k in range(2):
    rx = sx - 10 + k * 20
    box("rail", (0.06, 7, 0.06), (rx, sy, 0.75), steel)
    for t in (-3, 0, 3):
        cyl("rail_post", 0.04, 0.7, (rx, sy + t, 0.47), steel, segs=6)
box("ledge", (8, 1, 0.5), (sx + 12, sy + 6, 0.37), concrete_dark)

# ---- Shipping containers (12.2 x 2.44 x 2.6 m), some stacked.
spots = [(-40, 30, 0, 0), (-40, 33, 0, 0), (-40, 31.5, 1, 10), (-25, 45, 0, 90), (-20, 45, 0, 90), (-22.5, 45, 1, 85),
         (45, -20, 0, 30), (48, -24, 0, 25), (40, 50, 0, 0), (40, 50, 1, 0), (40, 50, 2, 5)]
for k, (x, y, lvl, yaw) in enumerate(spots):
    c = surf("metal_container%d" % (k % 4), container_cols[k % 4], metallic=0.5, rough=0.6)
    parts = [box("container", (12.2, 2.44, 2.6), (0, 0, 1.3), c)]
    # Corrugated sides, corner posts and the door end.
    for r in range(-28, 29):
        for ry_ in (-1, 1):
            parts.append(box("container_rib", (0.1, 0.06, 2.3), (r * 0.21, ry_ * 1.23, 1.3), c))
    for px_ in (-1, 1):
        for py_ in (-1, 1):
            parts.append(box("container_post", (0.16, 0.16, 2.6), (px_ * 6.02, py_ * 1.14, 1.3), concrete_dark))
    for py_ in (-0.5, 0.5):
        parts.append(box("container_door_bar", (0.05, 0.05, 2.3), (6.12, py_, 1.3), steel))
    o = zero_origin(join(parts, "container"))
    o.location = (x, y, lvl * 2.6)
    o.rotation_euler = (0, 0, math.radians(yaw))

# ---- Water tower.
wx, wy = 55, 20
for a in range(4):
    ang = a * math.pi / 2 + math.pi / 4
    cyl("tower_leg", 0.2, 16, (wx + math.cos(ang) * 3, wy + math.sin(ang) * 3, 8), rust, segs=8)
cyl("tank", 4.0, 5.0, (wx, wy, 18.5), rust, segs=24)
cyl("tank_roof", 4.2, 1.6, (wx, wy, 21.8), rust, r2=0.2, segs=24)
box("tower_brace", (6.2, 0.15, 0.15), (wx, wy, 8), rust)
box("tower_brace", (0.15, 6.2, 0.15), (wx, wy, 12), rust)

# Power poles with cables-free crossbars, dead trees, jersey barriers.
for k in range(6):
    px = -90 + k * 30
    cyl("pole", 0.15, 10, (px, -70, 5), surf("wood_pole", (0.3, 0.22, 0.15)), segs=8)
    box("crossbar", (2.4, 0.15, 0.15), (px, -70, 9.2), surf("wood_pole", (0.3, 0.22, 0.15)))
for _ in range(25):
    x, y = random.uniform(-110, 110), random.uniform(-110, 110)
    if abs(x - ox) < 25 and abs(y - oy) < 18:
        continue
    tree("tree", (x, y, 0), random.uniform(5, 10), "round", trunk, dead)
for k in range(8):
    box("barrier", (3, 0.6, 0.9), (-5 + k * 3.2, -12, 0.45), concrete)

# ---- Detail pass: rubble, rebar, scaffolding, fence, junk, wires, plants.
rubble_m = surf("concrete_rubble", (0.48, 0.46, 0.43))
rebar_m = surf("metal_rebar", (0.35, 0.18, 0.08), metallic=0.6, rough=0.7)
for k in range(40):
    x = ox + random.uniform(-BX / 2 - 6, BX / 2 + 6)
    y = oy + random.uniform(-BY / 2 - 6, BY / 2 + 6)
    rock("rubble", (x, y, 0.15), random.uniform(0.2, 0.7), rubble_m)
# Rebar sticking out of the broken slab edges and the half roof.
for f in (1, 2, 3):
    z = f * FH
    for k in range(14):
        x = ox + (0 if f == 3 else (-8 if f % 2 else 8)) + random.uniform(-4, 4) if f != 3 else ox + random.uniform(-0.3, 0.3)
        y = oy + random.uniform(-BY / 2, BY / 2)
        b = cyl("rebar", 0.016, random.uniform(0.5, 1.4), (x, y, z + 0.4), rebar_m, segs=4)
        b.rotation_euler = (random.uniform(-0.6, 0.6), random.uniform(-0.6, 0.6), 0)
# Scaffolding up the west face: tubes and planks, open between levels.
scx = ox - BX / 2 - 1.6
for j in range(7):
    yy = oy - BY / 2 + 2 + j * 3.0
    for xo in (0, 1.2):
        cyl("scaffold_pole", 0.03, FH * 3 + 1, (scx - xo, yy, (FH * 3 + 1) / 2), steel, segs=6)
for lvl in range(1, 4):
    z = lvl * FH
    box("scaffold_plank", (1.3, 18.2, 0.06), (scx - 0.6, oy - BY / 2 + 11, z), surf("wood_plank", (0.6, 0.45, 0.25)))
    for xo in (0, 1.2):
        box("scaffold_rail", (0.05, 18.2, 0.05), (scx - xo, oy - BY / 2 + 11, z + 1.0), steel)
# More graffiti, big pieces on the long walls.
for k in range(8):
    c = random.choice(graffiti)
    side = random.choice((-1, 1))
    graffiti_piece((ox + random.uniform(-14, 14), oy + side * BY / 2, random.uniform(1.4, 6.0)), "y", side, random.uniform(3, 5.5), random.uniform(1.2, 2.0), c)
# Tags on the container sides that face out.
for cx_, cy_, sg in ((-40, 30, -1), (-40, 33, 1), (40, 50, -1), (40, 50, 1)):
    graffiti_piece((cx_, cy_ + sg * 1.12, 1.3), "y", sg, random.uniform(3, 6), random.uniform(1.2, 1.8), random.choice(graffiti))
# Skate park extras: stair set with a handrail, a pyramid, a manual pad.
for k in range(4):
    box("stairs", (5, 0.4, 0.18 * (k + 1)), (sx + 10, sy - 6 + k * 0.4, 0.12 + 0.09 * (k + 1)), skate)
box("stairs_top", (5, 3, 0.72), (sx + 10, sy - 3.8, 0.48), skate)
railing((sx + 10, sy - 6.2), (sx + 10, sy - 4.2), 0.12, h=0.9)
pyr = cyl("pyramid", 3.4, 1.1, (sx - 6, sy - 3, 0.67), skate, r2=1.6, segs=4, smooth=False)
pyr.rotation_euler = (0, 0, math.radians(45))
box("manual_pad", (4, 2, 0.3), (sx + 2, sy + 6, 0.27), skate, bevel=0.03)
# Junk around the lot.
for k in range(8):
    x, y = random.uniform(-60, 60), random.uniform(-60, 60)
    if abs(x - ox) < 22 and abs(y - oy) < 15:
        continue
    pallet((x, y, 0), random.uniform(0, 90))
    if random.random() < 0.6:
        crate((x + 1.5, y, 0), random.uniform(0.6, 1.0), random.uniform(0, 90))
for k in range(10):
    x, y = random.uniform(-70, 70), random.uniform(-70, 70)
    cyl("barrel", 0.3, 0.9, (x, y, 0.45), random.choice([rust, surf("paint_barrel_blue", (0.1, 0.25, 0.6), rough=0.6)]), segs=12)
for k in range(5):
    tyre_stack((random.uniform(-60, 60), random.uniform(-60, 60), 0), random.randint(1, 4))
for k in range(12):
    traffic_cone((random.uniform(-40, 40), random.uniform(-40, -10), 0))
# Chain-link fence around the lot (see-through mesh between posts).
fence_m = surf("glass_fence", (0.4, 0.42, 0.42), rough=0.5, metallic=0.6, alpha=0.3)
L = 95
for side in range(4):
    for k in range(-19, 19):
        a, b = k * 5.0, (k + 1) * 5.0
        if side in (0, 2) and -10 < a < 10:
            continue  # gate gap
        y = L if side == 0 else -L
        if side < 2:
            p0, p1 = ((a, y), (b, y)) if side == 0 else ((a, -L), (b, -L))
        else:
            xx = L if side == 2 else -L
            p0, p1 = (xx, a), (xx, b)
        cx, cy = (p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2
        horiz = abs(p1[0] - p0[0]) > 0.1
        box("fence_mesh", (5 if horiz else 0.03, 0.03 if horiz else 5, 2.2), (cx, cy, 1.1), fence_m)
        cyl("fence_post", 0.04, 2.4, (p0[0], p0[1], 1.2), steel, segs=6)
        box("fence_top", (5 if horiz else 0.04, 0.04 if horiz else 5, 0.04), (cx, cy, 2.3), steel)
# Power line wires between the poles.
for k in range(5):
    for off in (-1.0, 1.0):
        x0 = -90 + k * 30
        box("wire", (30, 0.02, 0.02), (x0 + 15, -70 + off * 0.0, 9.3 + off * 0.0), surf("rubber", (0.02, 0.02, 0.02)), rot=(0, 0, 0))
# Weeds and scrub everywhere, some green trees on the edges.
for k in range(30):
    x, y = random.uniform(-100, 100), random.uniform(-100, 100)
    if (abs(x - ox) < 22 and abs(y - oy) < 15) or (abs(x - sx) < 18 and abs(y - sy) < 13):
        continue
    grass_tufts("weeds", (x, y, 0), random.uniform(1.5, 4), random.randint(15, 40), grass)
    if random.random() < 0.4:
        bush("scrub", (x, y, 0), random.uniform(0.5, 1.0), dead)
for k in range(18):
    a = random.uniform(0, math.tau)
    tree("tree", (105 * math.cos(a), 105 * math.sin(a), 0), random.uniform(7, 12), random.choice(["round", "pine"]))
ladder_x = wx + 2.9
for k in range(30):
    box("ladder_rung", (0.5, 0.04, 0.04), (wx, wy - 3.2, 0.5 + k * 0.5), rust)
for sxo in (-0.25, 0.25):
    box("ladder_rail", (0.04, 0.04, 15.5), (wx + sxo, wy - 3.2, 8.0), rust)

empty("spawn", (sx + 8, sy - 6, 0.13), 20)
print(finish_map("public/models/maps/bando.glb"))
