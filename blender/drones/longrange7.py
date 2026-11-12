# 7" long range: 315 mm true-X, 2807 motors, 7" bi-blades, 6S Li-ion under the frame, GPS mast.
exec(open(r"C:\Users\User\Documents\fly-sim\blender\lib.py").read())


def electronics(ctx):
    black = bpy.data.materials["black_plastic"]
    tip = mat("ant_tip", (0.1, 0.4, 0.95), rough=0.6)
    unit = box("air_unit", (0.03, 0.032, 0.009), (0, -0.03, 0.026), mat("air_unit", (0.18, 0.18, 0.2), metallic=0.8, rough=0.35), bevel=0.002)
    mast = cyl("gps_mast", 0.002, 0.04, (0, -0.06, 0.05), bpy.data.materials["alu"], segs=8)
    gps = cyl("gps", 0.014, 0.008, (0, -0.06, 0.072), mat("gps", (0.1, 0.1, 0.1), rough=0.4), segs=24)
    gps_top = cyl("gps_top", 0.012, 0.001, (0, -0.06, 0.0765), mat("gps_top", (0.9, 0.5, 0.05), rough=0.4), segs=24)
    t_l = antenna("ant_t_l", (0, -0.065, 0.016), (-1, -0.4, 0.15), 0.055, black, tip)
    t_r = antenna("ant_t_r", (0, -0.065, 0.016), (1, -0.4, 0.15), 0.055, black, tip)
    vtx_ant = antenna("ant_vtx", (0, -0.055, 0.032), (0, -0.5, 0.85), 0.07, black, tip)
    return join([unit, mast, gps, gps_top, t_l, t_r, vtx_ant], "electronics")


build_quad({
    "arm": 0.1114, "arm_root": 0.014, "arm_width": 0.017, "arm_thick": 0.0055,
    "motor_z": 0.0055, "stator_r": 0.014, "bell_r": 0.0172, "bell_h": 0.02,
    "bell_color": (0.05, 0.25, 0.85),
    "prop_r": 0.0889, "blades": 2, "prop_color": (0.75, 0.78, 0.82), "prop_alpha": 0.75, "pitch_deg": 11,
    "bottom_plate": (0.05, 0.13, 0.003),
    "top_plate": (0.045, 0.11, 0.0025, 0.0335),
    "stack": (0.036, 0.013),
    "battery": (0.068, 0.074, 0.046, -0.024), "battery_y": 0,
    "battery_color": (0.15, 0.55, 0.25),
    "cam_size": 0.019, "cam_loc": (0, 0.058, 0.018), "uptilt": 22,
    "tpu_color": (0.05, 0.3, 0.9),
    "extras": [electronics],
})
print(export_glb("public/models/drones/longrange7.glb"), [o.name for o in bpy.context.scene.objects])
