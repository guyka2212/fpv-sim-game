# Richer shared scenery for every map. Run after lib.py and maplib.py; it replaces maplib's simple
# tree() and car() with detailed versions, so every map that calls them gets the upgrade.
# Everything is still plain low-poly geometry: shape and silhouette carry the detail, the game adds
# textures, ambient occlusion and bloom on top.


def _jitter(bm, amount, keep_bottom=False):
    for v in bm.verts:
        if keep_bottom and v.co.z < -0.6 * max(1e-6, max(abs(w.co.z) for w in bm.verts)):
            continue
        v.co += Vector((random.uniform(-1, 1), random.uniform(-1, 1), random.uniform(-1, 1))) * amount


def blob(name, r, loc, material, scale=(1, 1, 1), subdiv=1, jitter=0.18):
    """Lumpy faceted sphere: foliage clusters, bushes, rocks."""
    bm = bmesh.new()
    bmesh.ops.create_icosphere(bm, subdivisions=subdiv, radius=r)
    _jitter(bm, r * jitter)
    for v in bm.verts:
        v.co = Vector((v.co.x * scale[0], v.co.y * scale[1], v.co.z * scale[2]))
    return _obj_from_bm(name, bm, material, loc)


def _mats():
    g = globals()
    try:
        ok = "_DM" in g and all((x[0] if isinstance(x, list) else x).name in bpy.data.materials for x in g["_DM"].values())
    except ReferenceError:  # materials freed by clear_scene()
        ok = False
    if not ok:
        g["_DM"] = {
            "bark": surf("wood_bark", (0.28, 0.19, 0.12)),
            "palm_bark": surf("wood_palm", (0.45, 0.36, 0.25)),
            "leaf": [surf("leaves_green", (0.13, 0.36, 0.09)), surf("leaves_deep", (0.08, 0.27, 0.07)), surf("leaves_light", (0.25, 0.47, 0.12))],
            "palm": [surf("leaves_palm", (0.16, 0.45, 0.12)), surf("leaves_palm_dark", (0.1, 0.33, 0.08))],
            "pine": [surf("leaves_pine", (0.06, 0.22, 0.09)), surf("leaves_pine_light", (0.1, 0.3, 0.12))],
            "dry": surf("leaves_dry", (0.36, 0.3, 0.15)),
            "rock": surf("rock_grey", (0.42, 0.41, 0.39)),
            "metal": surf("metal_dark", (0.12, 0.12, 0.13), metallic=0.8, rough=0.4),
            "steel": surf("metal_steel", (0.62, 0.63, 0.65), metallic=0.9, rough=0.3),
            "lamp": surf("lamp_glow", (1.0, 0.95, 0.85), emission=(1.0, 0.92, 0.75), strength=3.0),
            "wood": surf("wood_bench", (0.55, 0.36, 0.2)),
            "conc": surf("concrete_street", (0.62, 0.61, 0.58)),
            "orange": surf("plastic_orange", (1.0, 0.38, 0.03), rough=0.5),
            "white": surf("paint_white", (0.92, 0.92, 0.9), rough=0.5),
            "rubber": surf("rubber", (0.03, 0.03, 0.03), rough=0.9),
            "glass": surf("glass_car", (0.05, 0.07, 0.1), rough=0.05, metallic=0.3),
            "chrome": surf("metal_chrome", (0.8, 0.8, 0.82), metallic=1.0, rough=0.15),
            "redlight": surf("lamp_tail", (0.8, 0.02, 0.02), emission=(1.0, 0.05, 0.02), strength=1.5),
        }
    return g["_DM"]


# ---------------------------------------------------------------- vegetation

def leafy_tree(name, loc, h, leaf=None, dry=False):
    m = _mats()
    x, y, z = loc
    parts = [cyl(name + "_trunk", h * 0.045, h * 0.55, (x, y, z + h * 0.275), m["bark"], r2=h * 0.03, segs=7)]
    for k in range(3):
        a = random.uniform(0, math.tau)
        b = cyl(name + "_branch", h * 0.018, h * 0.3, (x + math.cos(a) * h * 0.07, y + math.sin(a) * h * 0.07, z + h * 0.55), m["bark"], r2=h * 0.008, segs=5)
        b.rotation_euler = (math.radians(35) * math.sin(a), -math.radians(35) * math.cos(a), 0)
        parts.append(b)
    mat_l = m["dry"] if dry else (leaf or random.choice(m["leaf"]))
    crown_r = h * 0.34
    for k in range(random.randint(8, 11)):
        a = random.uniform(0, math.tau)
        d = random.uniform(0.2, 0.75) * crown_r
        cz = z + h * 0.68 + random.uniform(-0.25, 0.3) * crown_r
        r = crown_r * random.uniform(0.5, 0.78)
        parts.append(blob(name + "_leaf", r, (x + math.cos(a) * d, y + math.sin(a) * d, cz), mat_l if dry or random.random() < 0.7 else random.choice(m["leaf"]),
                          scale=(1, 1, 0.85), jitter=0.22))
    parts.append(blob(name + "_leaf", crown_r * 0.6, (x, y, z + h * 0.86), mat_l, scale=(1, 1, 0.8)))
    return parts


def pine_tree(name, loc, h):
    m = _mats()
    x, y, z = loc
    parts = [cyl(name + "_trunk", h * 0.035, h * 0.35, (x, y, z + h * 0.175), m["bark"], segs=6)]
    layers = 6
    for k in range(layers):
        t = k / (layers - 1)
        r = h * (0.3 - 0.22 * t) * random.uniform(0.9, 1.1)
        c = cyl(name + "_cone", r, h * 0.26, (x, y, z + h * (0.25 + 0.13 * k)), random.choice(m["pine"]), r2=r * 0.15, segs=9, smooth=False)
        bm = bmesh.new()
        bm.from_mesh(c.data)
        for v in bm.verts:
            if v.co.z < 0:
                v.co.z += random.uniform(-0.12, 0.05) * h * 0.26
                v.co.x *= random.uniform(0.85, 1.12)
                v.co.y *= random.uniform(0.85, 1.12)
        bm.to_mesh(c.data)
        bm.free()
        parts.append(c)
    parts.append(cyl(name + "_tip", h * 0.05, h * 0.14, (x, y, z + h * 0.97), m["pine"][0], r2=0.0, segs=6, smooth=False))
    return parts


def _frond(name, base, yaw, length, droop, width, material):
    """One palm frond: a drooping spine with a V-shaped leaf blade tapering at both ends."""
    bm = bmesh.new()
    n = 9
    rows = []
    for i in range(n + 1):
        t = i / n
        # Rises then droops.
        dist = t * length
        zz = math.sin(t * math.pi * 0.6) * length * 0.25 - droop * t * t * length
        w = width * math.sin(math.pi * min(1.0, t * 1.15 + 0.05)) * (1 - 0.4 * t)
        cx, cy = math.cos(yaw) * dist, math.sin(yaw) * dist
        px, py = -math.sin(yaw), math.cos(yaw)
        rows.append([bm.verts.new((cx + px * w, cy + py * w, zz - w * 0.35)), bm.verts.new((cx, cy, zz)), bm.verts.new((cx - px * w, cy - py * w, zz - w * 0.35))])
    for i in range(n):
        a, b = rows[i], rows[i + 1]
        bm.faces.new((a[0], b[0], b[1], a[1]))
        bm.faces.new((a[1], b[1], b[2], a[2]))
    return _obj_from_bm(name, bm, material, base)


def palm_tree(name, loc, h, lean=None):
    m = _mats()
    x, y, z = loc
    lean_dir = random.uniform(0, math.tau)
    lean = random.uniform(0.04, 0.14) if lean is None else lean
    parts = []
    segs = 9
    px, py, pz = x, y, z
    for k in range(segs):
        t = (k + 1) / segs
        nx = x + math.cos(lean_dir) * lean * h * t * t
        ny = y + math.sin(lean_dir) * lean * h * t * t
        nz = z + h * t
        r = h * 0.032 * (1.15 - 0.35 * t)
        mid = ((px + nx) / 2, (py + ny) / 2, (pz + nz) / 2)
        dx, dy, dz = nx - px, ny - py, nz - pz
        L = math.sqrt(dx * dx + dy * dy + dz * dz)
        seg = cyl(name + "_trunk", r, L * 1.02, mid, m["palm_bark"], r2=r * 0.88, segs=8)
        seg.rotation_euler = Vector((dx, dy, dz)).to_track_quat("Z", "Y").to_euler()
        parts.append(seg)
        parts.append(cyl(name + "_ring", r * 1.12, L * 0.12, (px, py, pz + L * 0.05), m["palm_bark"], segs=8))
        px, py, pz = nx, ny, nz
    parts.append(blob(name + "_crown", h * 0.05, (px, py, pz), m["palm_bark"], jitter=0.1))
    for k in range(3):
        a = random.uniform(0, math.tau)
        parts.append(blob(name + "_nut", h * 0.022, (px + math.cos(a) * h * 0.04, py + math.sin(a) * h * 0.04, pz - h * 0.03), surf("wood_coconut", (0.3, 0.22, 0.1)), subdiv=1, jitter=0.05))
    count = random.randint(11, 14)
    for k in range(count):
        a = k * math.tau / count + random.uniform(-0.15, 0.15)
        parts.append(_frond(name + "_frond", (px, py, pz), a, h * random.uniform(0.42, 0.55), random.uniform(0.6, 1.2), h * 0.07, random.choice(m["palm"])))
    # A few young fronds pointing up.
    for k in range(3):
        a = random.uniform(0, math.tau)
        parts.append(_frond(name + "_frond", (px, py, pz), a, h * 0.3, -0.2, h * 0.05, m["palm"][0]))
    return parts


def bush(name, loc, r, material=None):
    m = _mats()
    x, y, z = loc
    mat_b = material or random.choice(m["leaf"])
    return [blob(name, r * random.uniform(0.6, 1.0), (x + random.uniform(-r, r) * 0.6, y + random.uniform(-r, r) * 0.6, z + r * 0.45), mat_b, scale=(1, 1, 0.75), jitter=0.25)
            for _ in range(random.randint(3, 5))]


def rock(name, loc, size, material=None):
    m = _mats()
    s = (random.uniform(0.8, 1.3), random.uniform(0.8, 1.3), random.uniform(0.45, 0.8))
    return blob(name, size, (loc[0], loc[1], loc[2] + size * s[2] * 0.35), material or m["rock"], scale=s, subdiv=1, jitter=0.3)


def grass_tufts(name, center, radius, count, material, avoid=()):
    """Clumps of thin blades scattered over a disc (merged into one mesh). avoid: (x0, x1, y0, y1) boxes."""
    bm = bmesh.new()
    cx, cy, cz = center
    for _ in range(count):
        a = random.uniform(0, math.tau)
        d = radius * math.sqrt(random.random())
        tx, ty = cx + math.cos(a) * d, cy + math.sin(a) * d
        if any(x0 <= tx <= x1 and y0 <= ty <= y1 for x0, x1, y0, y1 in avoid):
            continue
        for b in range(5):
            ang = random.uniform(0, math.tau)
            hgt = random.uniform(0.25, 0.6)
            w = 0.05
            lean = random.uniform(0.05, 0.2)
            v0 = bm.verts.new((tx + math.cos(ang + 1.57) * w, ty + math.sin(ang + 1.57) * w, cz))
            v1 = bm.verts.new((tx - math.cos(ang + 1.57) * w, ty - math.sin(ang + 1.57) * w, cz))
            v2 = bm.verts.new((tx + math.cos(ang) * lean, ty + math.sin(ang) * lean, cz + hgt))
            bm.faces.new((v0, v1, v2))
    return _obj_from_bm(name, bm, material)


def tree(name, loc, height, kind="round", trunk_mat=None, leaf_mat=None):
    """Drop-in replacement for maplib.tree: detailed trees of the same kinds."""
    if kind == "pine":
        return pine_tree(name, loc, height)
    if kind == "palm":
        return palm_tree(name, loc, height)
    dry = leaf_mat is not None and leaf_mat.name.startswith("leaves_dry")
    return leafy_tree(name, loc, height, leaf=None if dry else leaf_mat, dry=dry)


# ---------------------------------------------------------------- buildings

def facade(x, y, w, d, h, floor_h, frame_mat, glass_mat, bay=3.2, base=0.0, sides=(0, 1, 2, 3)):
    """Window grid on a box building: glass, floor spandrels and vertical mullions, slightly proud."""
    floors = max(1, int((h - base - 0.8) // floor_h))
    top = base + floors * floor_h
    for side in sides:
        horiz = side in (0, 2)
        length = (w if horiz else d) - 0.8
        off = (d if horiz else w) / 2
        sgn = -1 if side in (0, 3) else 1
        def put(nm, along, zc, sx, sz, depth, mat_):
            if horiz:
                box(nm, (sx, depth, sz), (x + along, y + sgn * (off + depth / 2), zc), mat_)
            else:
                box(nm, (depth, sx, sz), (x + sgn * (off + depth / 2), y + along, zc), mat_)
        put("facade_glass", 0, (base + top) / 2 + 0.3, length, top - base - 0.6, 0.03, glass_mat)
        for f in range(floors + 1):
            zf = base + f * floor_h
            put("facade_band", 0, zf + 0.35, length + 0.2, 0.7 if f else 0.9, 0.12, frame_mat)
        cols = max(1, int(length // bay))
        for c in range(cols + 1):
            put("facade_mullion", -length / 2 + c * length / cols, (base + top) / 2, 0.14, top - base, 0.09, frame_mat)
    box("roof_cap", (w + 0.3, d + 0.3, 0.45), (x, y, h + 0.22), frame_mat)


def rooftop_kit(x, y, w, d, h):
    m = _mats()
    for k in range(random.randint(1, 3)):
        ax = x + random.uniform(-w / 3, w / 3)
        ay = y + random.uniform(-d / 3, d / 3)
        ac_unit("ac", (ax, ay, h + 0.45))
    if random.random() < 0.4:
        cyl("vent", 0.35, 1.2, (x + random.uniform(-w / 3, w / 3), y + random.uniform(-d / 3, d / 3), h + 1.05), m["steel"], segs=10)
    if random.random() < 0.25 and w > 10:
        tx, ty = x + w / 4, y - d / 4
        for sx in (-1, 1):
            for sy in (-1, 1):
                cyl("tank_leg", 0.08, 2.2, (tx + sx * 1.0, ty + sy * 1.0, h + 1.55), m["metal"], segs=6)
        cyl("water_tank", 1.5, 2.2, (tx, ty, h + 3.7), surf("wood_tank", (0.42, 0.3, 0.2)), segs=14)
        cyl("tank_roof", 1.6, 0.8, (tx, ty, h + 5.2), m["metal"], r2=0.1, segs=14)


def ac_unit(name, loc):
    m = _mats()
    x, y, z = loc
    box(name, (1.6, 1.0, 0.9), (x, y, z), m["white"], bevel=0.03)
    cyl(name + "_fan", 0.36, 0.06, (x, y, z + 0.47), m["metal"], segs=14)
    for k in range(-2, 3):
        box(name + "_grille", (0.03, 0.75, 0.02), (x + k * 0.14, y, z + 0.51), m["steel"])


# ---------------------------------------------------------------- street furniture

def bench(loc, yaw_deg, mat_wood=None):
    m = _mats()
    x, y, z = loc
    wd = mat_wood or m["wood"]
    parts = []
    for k in range(4):
        parts.append(box("bench_slat", (1.9, 0.11, 0.04), (0, -0.2 + k * 0.13, 0.45), wd))
    for k in range(2):
        parts.append(box("bench_back", (1.9, 0.04, 0.1), (0, 0.24, 0.62 + k * 0.15), wd, rot=(math.radians(-12), 0, 0)))
    for sx in (-0.8, 0.8):
        parts.append(box("bench_leg", (0.06, 0.5, 0.45), (sx, 0, 0.22), m["metal"]))
        parts.append(box("bench_leg", (0.06, 0.06, 0.45), (sx, 0.24, 0.62), m["metal"]))
    o = zero_origin(join(parts, "bench"))
    o.data.transform(Matrix.Rotation(math.radians(yaw_deg), 4, "Z"))
    o.data.transform(Matrix.Translation((x, y, z)))
    return o


def street_lamp(loc, yaw_deg, h=6.0):
    m = _mats()
    x, y, z = loc
    a = math.radians(yaw_deg)
    dx, dy = math.cos(a), math.sin(a)
    cyl("lamp_base", 0.18, 0.5, (x, y, z + 0.25), m["metal"], segs=10)
    cyl("lamp_post", 0.07, h, (x, y, z + h / 2), m["metal"], r2=0.05, segs=10)
    box("lamp_arm", (1.3, 0.08, 0.08), (x + dx * 0.6, y + dy * 0.6, z + h - 0.1), m["metal"], rot=(0, 0, a))
    box("lamp_head", (0.7, 0.32, 0.14), (x + dx * 1.2, y + dy * 1.2, z + h - 0.15), m["metal"], rot=(0, 0, a), bevel=0.02)
    box("lamp_glow", (0.6, 0.24, 0.02), (x + dx * 1.2, y + dy * 1.2, z + h - 0.23), m["lamp"], rot=(0, 0, a))


def bin_(loc):
    m = _mats()
    cyl("bin", 0.28, 0.9, (loc[0], loc[1], loc[2] + 0.45), m["metal"], segs=12)
    cyl("bin_lid", 0.3, 0.06, (loc[0], loc[1], loc[2] + 0.93), m["steel"], segs=12)


def bollard(loc):
    m = _mats()
    cyl("bollard", 0.1, 0.9, (loc[0], loc[1], loc[2] + 0.45), m["metal"], segs=8)
    cyl("bollard_band", 0.105, 0.08, (loc[0], loc[1], loc[2] + 0.75), m["white"], segs=8)


def planter(loc, size=1.6, plant="bush"):
    m = _mats()
    x, y, z = loc
    box("planter", (size, size, 0.6), (x, y, z + 0.3), m["conc"], bevel=0.04)
    box("planter_soil", (size - 0.2, size - 0.2, 0.05), (x, y, z + 0.6), surf("dirt_planter", (0.22, 0.16, 0.1)))
    if plant == "palm":
        palm_tree("palm", (x, y, z + 0.6), random.uniform(5, 8))
    else:
        bush("planter_bush", (x, y, z + 0.6), size * 0.45)


def railing(p0, p1, z, h=1.05, material=None, post_every=1.5):
    m = _mats()
    mt = material or m["steel"]
    x0, y0 = p0
    x1, y1 = p1
    L = math.hypot(x1 - x0, y1 - y0)
    a = math.atan2(y1 - y0, x1 - x0)
    cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
    box("rail_top", (L, 0.06, 0.06), (cx, cy, z + h), mt, rot=(0, 0, a))
    box("rail_mid", (L, 0.03, 0.03), (cx, cy, z + h * 0.5), mt, rot=(0, 0, a))
    n = max(1, int(L / post_every))
    for k in range(n + 1):
        t = k / n
        cyl("rail_post", 0.025, h, (x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, z + h / 2), mt, segs=6)


def traffic_cone(loc):
    m = _mats()
    x, y, z = loc
    box("cone_base", (0.38, 0.38, 0.04), (x, y, z + 0.02), m["orange"])
    cyl("cone", 0.15, 0.7, (x, y, z + 0.39), m["orange"], r2=0.03, segs=10)
    cyl("cone_band", 0.105, 0.1, (x, y, z + 0.45), m["white"], r2=0.085, segs=10)


def jersey_barrier(loc, yaw_deg, length=3.0, material=None):
    m = _mats()
    bm = bmesh.new()
    prof = [(-0.3, 0), (0.3, 0), (0.3, 0.08), (0.15, 0.3), (0.1, 0.81), (-0.1, 0.81), (-0.15, 0.3), (-0.3, 0.08)]
    a = [bm.verts.new((-length / 2, py, pz)) for py, pz in prof]
    b = [bm.verts.new((length / 2, py, pz)) for py, pz in prof]
    k = len(prof)
    for i in range(k):
        bm.faces.new((a[i], a[(i + 1) % k], b[(i + 1) % k], b[i]))
    bm.faces.new(a[::-1])
    bm.faces.new(b)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return _obj_from_bm("barrier", bm, material or m["conc"], loc, (0, 0, math.radians(yaw_deg)))


def tyre_stack(loc, count=4, material=None):
    m = _mats()
    for k in range(count):
        ring("tyre", 0.2, 0.38, 0.24, (loc[0], loc[1], loc[2] + 0.12 + k * 0.24), material or m["rubber"], segs=14)


def crate(loc, s=1.0, yaw=0.0):
    box("crate", (s, s, s), (loc[0], loc[1], loc[2] + s / 2), surf("wood_crate", (0.55, 0.4, 0.22)), rot=(0, 0, math.radians(yaw)), bevel=0.02)


def pallet(loc, yaw=0.0):
    w = surf("wood_pallet", (0.6, 0.48, 0.3))
    for k in range(5):
        box("pallet_top", (1.2, 0.12, 0.02), (loc[0], loc[1] - 0.48 + k * 0.24, loc[2] + 0.13), w, rot=(0, 0, math.radians(yaw)))
    for k in (-0.5, 0, 0.5):
        box("pallet_runner", (1.2, 0.1, 0.1), (loc[0], loc[1] + k, loc[2] + 0.06), w, rot=(0, 0, math.radians(yaw)))


def parasol(loc, color):
    m = _mats()
    x, y, z = loc
    cyl("parasol_pole", 0.03, 2.4, (x, y, z + 1.2), m["steel"], segs=6)
    cyl("parasol", 1.4, 0.45, (x, y, z + 2.35), surf("fabric_parasol_%02x%02x%02x" % tuple(int(c * 255) for c in color), color, rough=0.7), r2=0.05, segs=10, smooth=False)
    cyl("table", 0.45, 0.04, (x, y, z + 0.74), m["white"], segs=12)
    cyl("table_leg", 0.04, 0.72, (x, y, z + 0.37), m["steel"], segs=6)
    for k in range(3):
        a = k * math.tau / 3
        box("chair", (0.42, 0.42, 0.05), (x + math.cos(a) * 0.8, y + math.sin(a) * 0.8, z + 0.45), m["white"])
        box("chair_back", (0.42, 0.04, 0.4), (x + math.cos(a) * 1.0, y + math.sin(a) * 1.0, z + 0.68), m["white"], rot=(0, 0, a + math.pi / 2))


def flag(loc, color, h=6.0):
    m = _mats()
    x, y, z = loc
    cyl("flag_pole", 0.05, h, (x, y, z + h / 2), m["steel"], segs=8)
    box("flag_cloth", (0.02, 1.5, 0.9), (x, y + 0.78, z + h - 0.55), surf("fabric_flag_%02x%02x%02x" % tuple(int(c * 255) for c in color), color, rough=0.8))


# ---------------------------------------------------------------- vehicles

def car(name, loc, yaw_deg, color, kind=None):
    """Drop-in replacement for maplib.car: a sedan / hatch / SUV with a real silhouette."""
    m = _mats()
    kind = kind or random.choice(["sedan", "sedan", "hatch", "suv"])
    paint = surf("paint_car_%02x%02x%02x" % tuple(int(c * 255) for c in color), color, rough=0.25, metallic=0.6)
    L, W = {"sedan": (4.5, 1.8), "hatch": (4.0, 1.75), "suv": (4.7, 1.95)}[kind]
    # Side profiles (y along the car, z up): body to the beltline, glasshouse above it.
    if kind == "sedan":
        body = [(-2.25, 0.3), (2.25, 0.3), (2.25, 0.62), (2.0, 0.82), (0.9, 0.9), (-1.6, 0.92), (-2.2, 0.85), (-2.25, 0.62)]
        cab = [(0.95, 0.9), (0.2, 1.38), (-0.95, 1.4), (-1.6, 0.93)]
    elif kind == "hatch":
        body = [(-2.0, 0.3), (2.0, 0.3), (2.0, 0.62), (1.75, 0.85), (0.8, 0.92), (-1.95, 0.95), (-2.0, 0.62)]
        cab = [(0.85, 0.92), (0.05, 1.42), (-1.75, 1.42), (-1.95, 0.96)]
    else:
        body = [(-2.35, 0.38), (2.35, 0.38), (2.35, 0.75), (2.1, 1.0), (1.0, 1.08), (-2.3, 1.1), (-2.35, 0.75)]
        cab = [(1.05, 1.08), (0.35, 1.68), (-2.15, 1.7), (-2.3, 1.12)]

    def extrude(profile, width, material):
        bm = bmesh.new()
        a = [bm.verts.new((-width / 2, py, pz)) for py, pz in profile]
        b = [bm.verts.new((width / 2, py, pz)) for py, pz in profile]
        k = len(profile)
        for i in range(k):
            bm.faces.new((a[i], a[(i + 1) % k], b[(i + 1) % k], b[i]))
        bm.faces.new(a[::-1])
        bm.faces.new(b)
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        bmesh.ops.bevel(bm, geom=list(bm.edges), offset=0.04, segments=1, affect="EDGES")
        return _obj_from_bm(name, bm, material)

    parts = [extrude(body, W, paint), extrude(cab, W - 0.14, m["glass"])]
    roof_y = (cab[1][0] + cab[2][0]) / 2
    parts.append(box(name + "_roof", (W - 0.2, abs(cab[1][0] - cab[2][0]) * 0.85, 0.05), (0, roof_y, cab[1][1] + 0.01), paint))
    wr = 0.33 if kind != "suv" else 0.38
    for sx in (-1, 1):
        for sy in (-L / 2 + 0.85, L / 2 - 0.8):
            parts.append(cyl(name + "_tyre", wr, 0.22, (sx * (W / 2 - 0.12), sy, wr), m["rubber"], rot=(0, math.radians(90), 0), segs=14))
            parts.append(cyl(name + "_rim", wr * 0.6, 0.02, (sx * (W / 2 - 0.0), sy, wr), m["chrome"], rot=(0, math.radians(90), 0), segs=10))
        parts.append(box(name + "_head", (0.4, 0.04, 0.12), (sx * (W / 2 - 0.3), L / 2 + 0.01, body[2][1] - 0.06), m["lamp"]))
        parts.append(box(name + "_tail", (0.4, 0.04, 0.12), (sx * (W / 2 - 0.3), -L / 2 - 0.01, body[-1][1]), m["redlight"]))
        parts.append(box(name + "_mirror", (0.18, 0.08, 0.1), (sx * (W / 2 + 0.06), cab[0][0] - 0.15, body[3][1] + 0.12), paint))
    parts.append(box(name + "_grille", (W * 0.5, 0.03, 0.14), (0, L / 2 + 0.01, 0.48), m["metal"]))
    c = zero_origin(join(parts, name))
    c.location = loc
    c.rotation_euler = (0, 0, math.radians(yaw_deg))
    return c


def crowd_row(x0, x1, y, z, fill=0.55, yaw=0.0):
    """Spectators along a stand row: a body and a head each, merged into one mesh per colour."""
    shirts = [surf("fabric_crowd_%d" % i, c, rough=0.9) for i, c in enumerate(
        [(0.85, 0.1, 0.1), (0.1, 0.25, 0.7), (0.95, 0.95, 0.95), (0.95, 0.75, 0.1), (0.1, 0.1, 0.1), (0.2, 0.55, 0.25)])]
    skin = surf("paint_skin", (0.75, 0.55, 0.42), rough=0.7)
    ca, sa = math.cos(yaw), math.sin(yaw)
    x = x0
    while x < x1:
        if random.random() < fill:
            px, py = x * ca - y * sa, x * sa + y * ca
            box("spectator", (0.42, 0.3, 0.55), (px, py, z + 0.28), random.choice(shirts), rot=(0, 0, yaw))
            box("spectator_head", (0.2, 0.2, 0.22), (px, py, z + 0.67), skin, rot=(0, 0, yaw))
        x += random.uniform(0.5, 0.8)


def truck(loc, yaw_deg, color):
    """Race team hauler: cab and a long box trailer in team colours."""
    m = _mats()
    paint = surf("paint_truck_%02x%02x%02x" % tuple(int(c * 255) for c in color), color, rough=0.3, metallic=0.4)
    parts = [box("trailer", (2.5, 13.6, 3.0), (0, -2.5, 2.0), paint, bevel=0.05),
             box("trailer_stripe", (2.52, 13.0, 0.4), (0, -2.5, 1.2), m["white"]),
             box("cab", (2.5, 2.4, 2.6), (0, 5.6, 1.75), paint, bevel=0.1),
             box("cab_window", (2.3, 0.05, 0.9), (0, 6.82, 2.5), m["glass"]),
             box("chassis", (2.0, 16, 0.5), (0, -1, 0.75), m["metal"])]
    for y in (5.6, -6.0, -7.4, -8.8):
        for sx in (-1, 1):
            parts.append(cyl("truck_tyre", 0.5, 0.35, (sx * 1.05, y, 0.5), m["rubber"], rot=(0, math.radians(90), 0), segs=14))
    o = zero_origin(join(parts, "truck"))
    o.data.transform(Matrix.Rotation(math.radians(yaw_deg), 4, "Z"))
    o.data.transform(Matrix.Translation(loc))
    return o
