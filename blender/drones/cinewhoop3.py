# 3" cinewhoop: ducted guards, 1506 motors, 5-blade props, 6S 660, GoPro on top.
exec(open(r"C:\Users\User\Documents\fly-sim\blender\lib.py").read())


def gopro(ctx):
    body_m = mat("gopro", (0.06, 0.06, 0.065), rough=0.45)
    glass = bpy.data.materials["lens_glass"]
    tpu = bpy.data.materials["tpu"]
    z = 0.062
    g = box("gopro", (0.071, 0.034, 0.05), (0, 0.022, z), body_m, bevel=0.004)
    lens = box("gopro_lens", (0.024, 0.006, 0.024), (-0.014, 0.041, z + 0.006), body_m, bevel=0.003)
    glass_o = cyl("gopro_glass", 0.009, 0.002, (-0.014, 0.0445, z + 0.006), glass, rot=(math.radians(90), 0, 0), segs=20)
    screen = box("gopro_screen", (0.02, 0.002, 0.02), (0.018, 0.0395, z + 0.01), glass)
    mount = box("gopro_mount", (0.05, 0.03, 0.012), (0, 0.022, 0.031), tpu, bevel=0.003)
    return join([g, lens, glass_o, screen, mount], "gopro")


def guard_ring(ctx):
    # Carbon plate that ties the ducts together.
    carbon = bpy.data.materials["carbon"]
    return box("duct_plate", (0.13, 0.13, 0.002), (0, 0, 0.001), carbon, bevel=0.01)


build_quad({
    "arm": 0.0495, "arm_root": 0.0, "arm_width": 0.012, "arm_thick": 0.003,
    "motor_z": 0.002, "stator_r": 0.0075, "bell_r": 0.0095, "bell_h": 0.012,
    "bell_color": (0.08, 0.08, 0.09),
    "prop_r": 0.0381, "blades": 5, "prop_color": (0.05, 0.05, 0.06), "pitch_deg": 15,
    "duct": {"r_in": 0.04, "wall": 0.0028, "h": 0.03, "z": 0.017, "lip": 0.003, "color": (0.05, 0.05, 0.05)},
    "top_plate": (0.04, 0.06, 0.002, 0.026), "standoff_base": 0.002,
    "stack": (0.03, 0.01),
    "battery": (0.03, 0.06, 0.028, 0.041), "battery_y": -0.03,
    "battery_color": (0.6, 0.05, 0.08),
    "cam_size": 0.014, "cam_loc": (0, 0.036, 0.016), "uptilt": 15,
    "tpu_color": (0.95, 0.75, 0.05),
    "extras": [gopro],
})
print(export_glb("public/models/drones/cinewhoop3.glb"), [o.name for o in bpy.context.scene.objects])
