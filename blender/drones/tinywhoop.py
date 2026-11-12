# 65 mm tiny whoop: ducted one-piece frame, 0802 motors, 31 mm 4-blade props, 1S 300 mAh.
exec(open(r"C:\Users\User\Documents\fly-sim\blender\lib.py").read())


def frame(ctx):
    plastic = bpy.data.materials["duct"]
    hub = cyl("frame_hub", 0.017, 0.0025, (0, 0, 0.0012), plastic, segs=24)
    spokes = [arm_bar("spoke_" + str(i), (0, 0), (sx * 0.023, sy * 0.023), 0.006, 0.0025, 0.0012, plastic, round_end=False)
              for i, (sx, sy) in enumerate(((1, 1), (1, -1), (-1, 1), (-1, -1)))]
    board = box("aio_board", (0.026, 0.026, 0.0016), (0, 0, 0.0035), bpy.data.materials["pcb"])
    canopy_m = mat("canopy", (0.95, 0.95, 0.98), rough=0.25, alpha=0.75)
    canopy = sphere("canopy", 0.014, (0, 0.002, 0.009), canopy_m, scale=(0.9, 1.2, 0.75))
    return join([hub, *spokes, board, canopy], "frame")


build_quad({
    "arm": 0.023, "motor_z": 0.0005, "stator_r": 0.0035, "bell_r": 0.0045, "bell_h": 0.007,
    "bell_color": (0.75, 0.75, 0.78),
    "prop_r": 0.0155, "blades": 4, "prop_color": (0.95, 0.1, 0.15), "pitch_deg": 16,
    "duct": {"r_in": 0.0165, "wall": 0.0012, "h": 0.016, "z": 0.006, "lip": 0.0018, "color": (0.85, 0.2, 0.7)},
    "battery": (0.012, 0.055, 0.009, -0.0045), "battery_y": 0, "strap": False,
    "battery_color": (0.85, 0.85, 0.2),
    "cam_size": 0.0085, "cam_loc": (0, 0.012, 0.009), "uptilt": 12,
    "cam_mount": False,
    "extras": [frame],
})
print(export_glb("public/models/drones/tinywhoop.glb"), [o.name for o in bpy.context.scene.objects])
