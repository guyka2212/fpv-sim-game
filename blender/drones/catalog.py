# Builds every drone in src/drones/catalog.json (the Flight Path drones) with build_quad.
# Sizes come from the catalog (arm, prop, motor stator, battery cells x capacity), so the models
# match the physics specs the game derives from the same file. Run: blender -b --python this.
import json
exec(open(r"C:\Users\User\Documents\fly-sim\blender\lib.py").read())

CATALOG = json.load(open(os.path.join(PROJECT, "src", "drones", "catalog.json"), encoding="utf-8"))
ONLY = globals().get("ONLY_IDS")


def antennas_extra(tip_color, arm):
    def make(ctx):
        black = bpy.data.materials["black_plastic"]
        tip = mat("ant_tip", tip_color, rough=0.6)
        s = arm / 0.08
        a1 = antenna("ant_vtx", (0.012 * s, -0.05 * s, 0.02 * s), (0.35, -0.8, 0.5), 0.055 * s, black, tip)
        a2 = antenna("ant_rx", (-0.012 * s, -0.05 * s, 0.02 * s), (-0.35, -0.8, 0.5), 0.045 * s, black, tip)
        return join([a1, a2], "antennas")
    return make


def hd_unit_extra(arm):
    def make(ctx):
        s = max(0.6, arm / 0.08)
        u = box("air_unit", (0.03 * s, 0.032 * s, 0.009 * s), (0, -0.022 * s, 0.024 * s), mat("air_unit", (0.18, 0.18, 0.2), metallic=0.8, rough=0.35), bevel=0.002 * s)
        fan = cyl("air_unit_fan", 0.009 * s, 0.002 * s, (0, -0.022 * s, 0.0292 * s), mat("fan", (0.05, 0.05, 0.05)), segs=16)
        return join([u, fan], "air_unit")
    return make


def gopro_extra(top_z, y=0.02):
    def make(ctx):
        body_m = mat("gopro", (0.06, 0.06, 0.065), rough=0.45)
        glass = bpy.data.materials["lens_glass"]
        tpu = bpy.data.materials["tpu"]
        z = top_z + 0.031
        g = box("gopro", (0.071, 0.034, 0.05), (0, y, z), body_m, bevel=0.004)
        lens = box("gopro_lens", (0.024, 0.006, 0.024), (-0.014, y + 0.019, z + 0.006), body_m, bevel=0.003)
        glass_o = cyl("gopro_glass", 0.009, 0.002, (-0.014, y + 0.0225, z + 0.006), glass, rot=(math.radians(90), 0, 0), segs=20)
        mount = box("gopro_mount", (0.05, 0.03, 0.012), (0, y, top_z + 0.004), tpu, bevel=0.003)
        return join([g, lens, glass_o, mount], "gopro")
    return make


def gps_extra(arm):
    def make(ctx):
        s = arm / 0.11
        mast = cyl("gps_mast", 0.002 * s, 0.04 * s, (0, -0.06 * s, 0.05 * s), bpy.data.materials["alu"], segs=8)
        gps = cyl("gps", 0.014 * s, 0.008 * s, (0, -0.06 * s, 0.072 * s), mat("gps", (0.1, 0.1, 0.1), rough=0.4), segs=24)
        top = cyl("gps_top", 0.012 * s, 0.001 * s, (0, -0.06 * s, 0.0765 * s), mat("gps_top", (0.9, 0.5, 0.05), rough=0.4), segs=24)
        return join([mast, gps, top], "gps")
    return make


def whoop_frame_extra(arm):
    def make(ctx):
        plastic = bpy.data.materials["duct"]
        s = arm / 0.023
        hub = cyl("frame_hub", 0.017 * s, 0.0025 * s, (0, 0, 0.0012 * s), plastic, segs=24)
        spokes = [arm_bar("spoke_" + str(i), (0, 0), (sx * arm, sy * arm), 0.006 * s, 0.0025 * s, 0.0012 * s, plastic, round_end=False)
                  for i, (sx, sy) in enumerate(((1, 1), (1, -1), (-1, 1), (-1, -1)))]
        board = box("aio_board", (0.026 * s, 0.026 * s, 0.0016 * s), (0, 0, 0.0035 * s), bpy.data.materials["pcb"])
        canopy = sphere("canopy", 0.014 * s, (0, 0.002 * s, 0.009 * s), mat("canopy", (0.95, 0.95, 0.98), rough=0.25, alpha=0.75), scale=(0.9, 1.2, 0.75))
        return join([hub, *spokes, board, canopy], "frame")
    return make


def cinema_cam_extra(arm):
    def make(ctx):
        body = mat("cinema_cam", (0.08, 0.08, 0.09), rough=0.4)
        glass = bpy.data.materials["lens_glass"]
        cam = box("cinema_body", (0.09, 0.11, 0.085), (0, 0.0, -0.075), body, bevel=0.006)
        lens = cyl("cinema_lens", 0.032, 0.07, (0, 0.085, -0.07), body, rot=(math.radians(90), 0, 0), segs=24)
        front = cyl("cinema_glass", 0.026, 0.004, (0, 0.121, -0.07), glass, rot=(math.radians(90), 0, 0), segs=24)
        cage = box("cinema_cage", (0.11, 0.13, 0.006), (0, 0.0, -0.03), bpy.data.materials["alu"], bevel=0.002)
        return join([cam, lens, front, cage], "cinema_cam")
    return make


def build(d):
    fam = d["family"]
    arm = d["armMm"] / 1000.0  # motor offset from the centre along x and y (like armX / armZ)
    prop_r = d["propIn"] * 0.0254 / 2
    stator_d, stator_h = d["stator"]
    stator_r = stator_d / 2000.0
    bell_r = stator_r * 1.28
    bell_h = (stator_h + 11) / 1000.0 * (0.6 if stator_d < 13 else 1.0)
    s = arm / 0.0795  # relative to the Freestyle 5"
    c = d["colors"]
    cells, mah = d["cells"], d["mAh"]
    vol = (cells * mah / 6600.0) ** (1 / 3)
    metal = d.get("metal", False)
    ducted = fam in ("whoop", "cinewhoop")
    small = fam == "whoop"
    p = {
        "arm": arm,
        "motor_z": 0.0005 if small else 0.005 * min(1.5, s),
        "stator_r": stator_r, "bell_r": bell_r, "bell_h": bell_h,
        "bell_color": tuple(c["bell"]),
        "prop_r": prop_r, "blades": d["blades"], "prop_color": tuple(c["prop"]),
        "pitch_deg": 16 if fam == "racer" else 11 if fam == "longrange" else 14,
        "battery": (0.035 * vol, 0.074 * vol, 0.038 * vol, 0.0525 * min(1.6, max(0.35, s))),
        "battery_y": 0.0,
        "battery_color": tuple(c.get("battery", (0.05, 0.12, 0.35))),
        "cam_size": 0.0085 if small else 0.014 if s < 0.8 else 0.019,
        "uptilt": d["uptilt"],
        "tpu_color": tuple(c.get("tpu", c["bell"])),
        "extras": [],
    }
    if small:
        p.update({"strap": False, "cam_mount": False, "battery": (0.012 * vol * 2, 0.055 * vol * 1.4, 0.009 * vol * 2, -0.0045), "cam_loc": (0, arm * 0.5, arm * 0.4)})
        p["duct"] = {"r_in": prop_r + 0.0012, "wall": 0.0012 * (arm / 0.023), "h": 0.016 * (arm / 0.023), "z": 0.006 * (arm / 0.023), "lip": 0.0018, "color": tuple(c.get("duct", (0.2, 0.2, 0.2)))}
        p["extras"].append(whoop_frame_extra(arm))
    else:
        p.update({
            "arm_root": 0.012 * s, "arm_width": max(0.006, 0.0145 * s * (0.75 if fam in ("toothpick", "racer") else 1)), "arm_thick": max(0.0025, 0.005 * min(1.4, s)),
            "bottom_plate": (0.042 * min(1.5, max(0.6, s)), 0.11 * min(1.5, max(0.55, s)), 0.003),
            "top_plate": (0.04 * min(1.5, max(0.6, s)), 0.095 * min(1.5, max(0.55, s)), 0.0025, 0.0315 * min(1.5, max(0.6, s))),
            "stack": (0.036 * min(1.3, max(0.7, s)), 0.013 * min(1.3, max(0.6, s))),
            "cam_loc": (0, 0.046 * min(1.4, max(0.6, s)), 0.017 * min(1.4, max(0.6, s))),
        })
        if ducted:
            p["duct"] = {"r_in": prop_r + 0.002, "wall": 0.0028, "h": prop_r * 0.8, "z": prop_r * 0.45, "lip": 0.003, "color": tuple(c.get("duct", (0.05, 0.05, 0.05)))}
        if fam == "longrange":
            p["battery"] = (0.068 * vol, 0.074 * vol, 0.046 * vol, -0.024 * min(1.5, s))
            p["extras"].append(gps_extra(arm))
        if fam == "cinelifter":
            p["extras"].append(cinema_cam_extra(arm))
        if d.get("gopro"):
            p["extras"].append(gopro_extra(p["top_plate"][3]))
        if not ducted:
            p["extras"].append(hd_unit_extra(arm))
        p["extras"].append(antennas_extra(tuple(c.get("tpu", c["bell"])), arm))
    if fam in ("freestyle", "longrange", "toothpick"):
        p["props_out"] = True
    body = build_quad(p)
    if metal or "carbon" in c:
        # Trophy finish: the carbon goes the colour given, polished.
        mat("carbon", tuple(c.get("carbon", (0.03, 0.03, 0.03))), metallic=0.9 if metal else 0.3, rough=0.22 if metal else 0.32)
        if metal:
            mat("bell", tuple(c["bell"]), metallic=1.0, rough=0.18)
    path = export_glb(f"public/models/drones/{d['id']}.glb")
    return path


for d in CATALOG:
    if ONLY and d["id"] not in ONLY:
        continue
    print("built", build(d))
