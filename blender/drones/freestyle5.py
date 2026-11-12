# 5" freestyle: 225 mm true-X, 2207 motors, 5.1" tri-blades, 6S 1100, HD air unit.
exec(open(r"C:\Users\User\Documents\fly-sim\blender\lib.py").read())


def hd_unit(ctx):
    alu_dark = mat("air_unit", (0.18, 0.18, 0.2), metallic=0.8, rough=0.35)
    u = box("air_unit", (0.03, 0.032, 0.009), (0, -0.022, 0.024), alu_dark, bevel=0.002)
    fan = cyl("air_unit_fan", 0.009, 0.002, (0, -0.022, 0.0292), mat("fan", (0.05, 0.05, 0.05)), segs=16)
    return join([u, fan], "air_unit")


def antennas(ctx):
    black = bpy.data.materials["black_plastic"]
    tip = mat("ant_tip", (0.9, 0.25, 0.05), rough=0.6)
    a1 = antenna("ant_vtx", (0.012, -0.05, 0.02), (0.35, -0.8, 0.5), 0.055, black, tip)
    a2 = antenna("ant_rx", (-0.012, -0.05, 0.02), (-0.35, -0.8, 0.5), 0.045, black, tip)
    return join([a1, a2], "antennas")


build_quad({
    "arm": 0.0795, "arm_root": 0.012, "arm_width": 0.0145, "arm_thick": 0.005,
    "motor_z": 0.005, "stator_r": 0.011, "bell_r": 0.0142, "bell_h": 0.018,
    "bell_color": (0.45, 0.05, 0.7),
    "prop_r": 0.0648, "blades": 3, "prop_color": (1.0, 0.38, 0.03), "prop_alpha": 0.92,
    "bottom_plate": (0.042, 0.11, 0.003),
    "top_plate": (0.04, 0.095, 0.0025, 0.0315),
    "stack": (0.036, 0.013),
    "battery": (0.035, 0.074, 0.038, 0.0525), "battery_y": 0.002,
    "cam_size": 0.019, "cam_loc": (0, 0.046, 0.017), "uptilt": 30,
    "tpu_color": (1.0, 0.38, 0.03),
    "extras": [hd_unit, antennas],
})
print(export_glb("public/models/drones/freestyle5.glb"), [o.name for o in bpy.context.scene.objects])
