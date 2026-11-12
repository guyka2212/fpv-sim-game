# 5" racer: low-profile 220 mm frame, thin arms, 2306 motors, light 6S, analog VTX.
exec(open(r"C:\Users\User\Documents\fly-sim\blender\lib.py").read())


def vtx(ctx):
    black = bpy.data.materials["black_plastic"]
    tip = mat("ant_tip", (0.1, 0.9, 0.2), rough=0.6)
    board = box("vtx", (0.02, 0.02, 0.004), (0, -0.03, 0.012), bpy.data.materials["pcb"])
    pagoda = antenna("ant_vtx", (0, -0.05, 0.016), (0, -0.55, 0.85), 0.05, black, tip)
    lolli = sphere("ant_lolli", 0.009, (0, -0.05 - 0.55 * 0.055, 0.016 + 0.85 * 0.055), tip, scale=(1, 1, 0.55))
    rx = antenna("ant_rx", (-0.01, -0.045, 0.006), (-0.6, -0.8, 0.0), 0.04, black, tip)
    return join([board, pagoda, lolli, rx], "vtx")


build_quad({
    "arm": 0.0778, "arm_root": 0.01, "arm_width": 0.011, "arm_thick": 0.0045,
    "motor_z": 0.0045, "stator_r": 0.0115, "bell_r": 0.0138, "bell_h": 0.017,
    "bell_color": (0.85, 0.06, 0.04),
    "prop_r": 0.0635, "blades": 3, "prop_color": (0.35, 1.0, 0.1), "prop_alpha": 0.9, "pitch_deg": 17,
    "bottom_plate": (0.036, 0.1, 0.0035),
    "top_plate": (0.032, 0.085, 0.002, 0.022),
    "stack": (0.03, 0.01),
    "battery": (0.033, 0.072, 0.032, 0.0395), "battery_y": -0.004,
    "battery_color": (0.08, 0.08, 0.08),
    "cam_size": 0.019, "cam_loc": (0, 0.042, 0.013), "uptilt": 42,
    "tpu_color": (0.35, 1.0, 0.1),
    "extras": [vtx],
})
print(export_glb("public/models/drones/racer5.glb"), [o.name for o in bpy.context.scene.objects])
