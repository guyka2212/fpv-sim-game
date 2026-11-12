# Race cars that drive around the f1 and oval maps: public/models/cars/f1car.glb and stockcar.glb.
# +Y is the nose. Wheels are separate objects (wheel_FL, wheel_FR, wheel_RL, wheel_RR) with their
# origin at the hub so the game can spin them. Materials named "livery" / "livery2" are recoloured per
# car in the game, and "number" planes (UV 0..1) get a painted race number.
exec(open(r"C:\Users\User\Documents\fly-sim\blender\lib.py").read())
exec(open(r"C:\Users\User\Documents\fly-sim\blender\maplib.py").read())

def make_mats():
    """clear_scene() drops unused materials, so create them after clearing."""
    global livery, livery2, carbon, tyre, rim, window, numm, yellow
    livery = mat("livery", (0.8, 0.05, 0.05), metallic=0.5, rough=0.25)
    livery2 = mat("livery2", (0.95, 0.95, 0.95), metallic=0.3, rough=0.3)
    carbon = mat("carbon", (0.03, 0.03, 0.035), metallic=0.3, rough=0.35)
    tyre = mat("rubber_tyre", (0.025, 0.025, 0.025), rough=0.85)
    rim = mat("metal_rim", (0.25, 0.25, 0.27), metallic=0.9, rough=0.3)
    window = mat("black_window", (0.02, 0.025, 0.03), metallic=0.4, rough=0.1)
    numm = mat("number", (1, 1, 1), rough=0.5)
    yellow = mat("decal_yellow", (0.95, 0.8, 0.05), rough=0.5)


def wheel(name, loc, r, w):
    t = cyl(name, r, w, loc, tyre, rot=(0, math.radians(90), 0), segs=20)
    side = 1 if loc[0] > 0 else -1
    h = cyl(name + "_rim", r * 0.62, 0.02, (loc[0] + side * w / 2, loc[1], loc[2]), rim, rot=(0, math.radians(90), 0), segs=14)
    o = join([t, h], name)
    return o


def number_plane(name, center, u_axis, v_axis, su, sv):
    """Flat quad facing out of u x v, UV mapped 0..1 so a number texture reads correctly."""
    c, u, v = Vector(center), Vector(u_axis) * su / 2, Vector(v_axis) * sv / 2
    bm = bmesh.new()
    uv = bm.loops.layers.uv.new()
    vs = [bm.verts.new(c - u - v), bm.verts.new(c + u - v), bm.verts.new(c + u + v), bm.verts.new(c - u + v)]
    f = bm.faces.new(vs)
    for loop, (a, b) in zip(f.loops, ((0, 0), (1, 0), (1, 1), (0, 1))):
        loop[uv].uv = (a, b)
    return _obj_from_bm(name, bm, numm)


def build_f1():
    clear_scene()
    make_mats()
    parts = [
        box("floor", (1.4, 4.0, 0.05), (0, -0.1, 0.08), carbon),
        box("tub", (0.7, 2.0, 0.5), (0, 0.65, 0.42), livery, bevel=0.08),
        box("cockpit_rim", (0.55, 0.8, 0.1), (0, 0.1, 0.7), carbon, bevel=0.03),
        box("sidepod", (0.42, 1.6, 0.42), (0.55, -0.35, 0.38), livery, bevel=0.1),
        box("sidepod", (0.42, 1.6, 0.42), (-0.55, -0.35, 0.38), livery, bevel=0.1),
        box("sidepod_stripe", (0.44, 1.2, 0.08), (0.56, -0.3, 0.5), livery2),
        box("sidepod_stripe", (0.44, 1.2, 0.08), (-0.56, -0.3, 0.5), livery2),
        box("engine_cover", (0.5, 1.9, 0.48), (0, -1.0, 0.55), livery, bevel=0.12),
        box("airbox", (0.3, 0.5, 0.32), (0, -0.35, 0.92), livery2, bevel=0.06),
        box("fin", (0.03, 1.3, 0.32), (0, -1.55, 0.9), livery),
        box("diffuser", (1.0, 0.4, 0.25), (0, -2.15, 0.2), carbon),
        box("gearbox", (0.3, 0.6, 0.3), (0, -2.0, 0.35), carbon),
    ]
    nose = cyl("nose", 0.2, 1.2, (0, 2.2, 0.36), livery, rot=(math.radians(-90), 0, 0), r2=0.07, segs=12)
    nose.scale = (1.3, 1, 1)
    parts.append(nose)
    # Front wing: two elements and endplates.
    parts += [box("fw_main", (1.95, 0.42, 0.04), (0, 2.68, 0.1), carbon), box("fw_flap", (1.85, 0.25, 0.04), (0, 2.55, 0.2), livery2, rot=(math.radians(-15), 0, 0))]
    for s in (-1, 1):
        parts.append(box("fw_end", (0.03, 0.5, 0.26), (s * 0.97, 2.6, 0.18), livery))
    # Rear wing, endplates and pylon.
    parts += [box("rw_main", (1.0, 0.32, 0.04), (0, -2.5, 0.8), carbon), box("rw_flap", (1.0, 0.22, 0.04), (0, -2.48, 0.93), livery2, rot=(math.radians(20), 0, 0)),
              box("rw_pylon", (0.06, 0.25, 0.5), (0, -2.35, 0.55), carbon)]
    for s in (-1, 1):
        parts.append(box("rw_end", (0.03, 0.6, 0.55), (s * 0.5, -2.45, 0.75), livery))
    # Halo, helmet and mirrors.
    parts += [ring("halo", 0.31, 0.36, 0.05, (0, 0.05, 0.95), carbon, segs=24), box("halo_pylon", (0.06, 0.06, 0.32), (0, 0.42, 0.8), carbon, rot=(math.radians(25), 0, 0)),
              sphere("helmet", 0.14, (0, 0.0, 0.83), livery2, segs=12, rings=8)]
    for s in (-1, 1):
        parts.append(box("mirror", (0.14, 0.05, 0.07), (s * 0.45, 0.65, 0.78), livery))
    # Suspension arms (thin carbon rods) to the wheels.
    for wy, wx in ((1.75, 0.8), (-1.85, 0.78)):
        for s in (-1, 1):
            parts.append(box("wishbone", (wx - 0.3, 0.06, 0.03), (s * (wx + 0.3) / 2, wy, 0.38), carbon))
            parts.append(box("wishbone", (wx - 0.3, 0.06, 0.03), (s * (wx + 0.3) / 2, wy, 0.26), carbon))
    body = join(parts, "body")
    nums = [number_plane("number", (0, 2.32, 0.57), (1, 0, 0), (0, 1, 0.55), 0.28, 0.22)]
    for s in (-1, 1):
        nums.append(number_plane("number", (s * 0.775, -0.9, 0.48), (0, s, 0), (0, 0, 1), 0.36, 0.3))
    join(nums, "number")
    wheels = [wheel("wheel_FL", (-0.8, 1.75, 0.34), 0.34, 0.32), wheel("wheel_FR", (0.8, 1.75, 0.34), 0.34, 0.32),
              wheel("wheel_RL", (-0.78, -1.85, 0.36), 0.36, 0.42), wheel("wheel_RR", (0.78, -1.85, 0.36), 0.36, 0.42)]
    return export_glb("public/models/cars/f1car.glb")


def build_stock():
    clear_scene()
    make_mats()
    parts = [
        box("lower_body", (1.95, 5.0, 0.62), (0, 0, 0.5), livery, bevel=0.1),
        box("hood", (1.8, 1.55, 0.18), (0, 1.55, 0.86), livery, bevel=0.06, rot=(math.radians(-4), 0, 0)),
        box("deck", (1.8, 1.0, 0.2), (0, -2.0, 0.88), livery, bevel=0.06),
        box("greenhouse", (1.55, 2.2, 0.5), (0, -0.35, 1.07), window, bevel=0.12),
        box("roof", (1.45, 1.35, 0.07), (0, -0.4, 1.33), livery, bevel=0.03),
        box("side_stripe", (1.97, 3.2, 0.14), (0, 0.0, 0.62), livery2),
        box("splitter", (1.9, 0.4, 0.05), (0, 2.45, 0.12), window),
        box("spoiler", (1.75, 0.05, 0.28), (0, -2.47, 1.12), window, rot=(math.radians(-15), 0, 0)),
        box("bumper", (1.9, 0.25, 0.35), (0, -2.45, 0.42), livery2, bevel=0.05),
        box("grille", (1.2, 0.05, 0.22), (0, 2.5, 0.5), window),
    ]
    for s in (-1, 1):
        parts.append(box("headlight", (0.4, 0.05, 0.14), (s * 0.62, 2.5, 0.72), yellow))
        parts.append(box("arch", (0.08, 0.95, 0.12), (s * 0.97, 1.4, 0.75), livery2))
        parts.append(box("arch", (0.08, 0.95, 0.12), (s * 0.97, -1.45, 0.75), livery2))
        parts.append(box("window_net", (0.03, 0.6, 0.35), (s * 0.78, -0.1, 1.05), carbon))
    join(parts, "body")
    nums = [number_plane("number", (0, -0.4, 1.371), (0, 1, 0), (-1, 0, 0), 1.05, 1.05)]
    for s in (-1, 1):
        nums.append(number_plane("number", (s * 0.991, -0.2, 0.55), (0, s, 0), (0, 0, 1), 1.05, 0.5))
    join(nums, "number")
    for nm, x, y in (("wheel_FL", -0.84, 1.42), ("wheel_FR", 0.84, 1.42), ("wheel_RL", -0.84, -1.48), ("wheel_RR", 0.84, -1.48)):
        wheel(nm, (x, y, 0.34), 0.34, 0.3)
    return export_glb("public/models/cars/stockcar.glb")


print(build_f1())
print(build_stock())
