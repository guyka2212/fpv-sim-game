# Renders a preview image of each exported map GLB into public/previews/<id>.jpg.
# Usage (inside Blender): set PREVIEW_IDS = ["bando", ...] or leave unset for all, then exec this file.
exec(open(r"C:\Users\User\Documents\fly-sim\blender\lib.py").read())

# id: (camera location, look-at target, sun elevation deg, sun azimuth deg, cut away the roof, horizon ground colour)
SHOTS = {
    "bando": ((-40, -30, 14), (8, 16, 3), 38, 140, False, (0.3, 0.27, 0.2)),
    "racetrack": ((-88, -48, 14), (0, 10, 0), 52, 200, False, (0.14, 0.32, 0.1)),
    "house": ((3.5, -12.5, 11), (-0.5, -0.5, 0.3), 55, 160, True, (0.16, 0.36, 0.1)),
    "town": ((130, -150, 75), (-5, 10, 2), 30, 250, False, (0.17, 0.37, 0.12)),
    "mountains": ((-560, -330, 210), (60, 40, 30), 34, 160, False, None),
    "mall": ((215, -110, 70), (115, 0, 12), 62, 160, False, (0.2, 0.2, 0.21)),
    "f1": ((-120, -300, 70), (40, -110, 0), 46, 210, False, (0.17, 0.38, 0.11)),
    "oval": ((-330, -360, 95), (60, -40, 0), 40, 120, False, (0.17, 0.38, 0.11)),
    "lake": ((-120, -300, 45), (40, 20, 2), 36, 200, False, None),
    "hollywood": ((110, -330, 85), (0, 130, 35), 34, 235, False, None),
    "paris": ((230, -420, 110), (-10, -100, 70), 40, 150, False, (0.55, 0.53, 0.5)),
    "stadium": ((170, -200, 95), (0, 0, 8), 50, 210, False, (0.45, 0.45, 0.43)),
}


def setup_world(elev, azim):
    world = bpy.data.worlds.get("preview_world") or bpy.data.worlds.new("preview_world")
    bpy.context.scene.world = world
    world.use_nodes = True
    nt = world.node_tree
    nt.nodes.clear()
    sky = nt.nodes.new("ShaderNodeTexSky")
    for t in ("NISHITA", "MULTIPLE_SCATTERING", "SINGLE_SCATTERING", "HOSEK_WILKIE"):
        try:
            sky.sky_type = t
            break
        except TypeError:
            continue
    for attr, val in (("sun_elevation", math.radians(elev)), ("sun_rotation", math.radians(azim))):
        if hasattr(sky, attr):
            setattr(sky, attr, val)
    bg = nt.nodes.new("ShaderNodeBackground")
    bg.inputs[1].default_value = 0.06
    out = nt.nodes.new("ShaderNodeOutputWorld")
    nt.links.new(sky.outputs[0], bg.inputs[0])
    nt.links.new(bg.outputs[0], out.inputs[0])

    sun_data = bpy.data.lights.new("preview_sun", "SUN")
    sun_data.energy = 4.5
    sun_data.angle = math.radians(2)
    sun = bpy.data.objects.new("preview_sun", sun_data)
    bpy.context.scene.collection.objects.link(sun)
    # Point the light down the sun direction.
    d = Vector((math.cos(math.radians(elev)) * math.sin(math.radians(azim)), math.cos(math.radians(elev)) * math.cos(math.radians(azim)), math.sin(math.radians(elev))))
    sun.rotation_euler = (-d).to_track_quat("-Z", "Y").to_euler()


def set_engine(scene):
    for eng in ("BLENDER_EEVEE", "BLENDER_EEVEE_NEXT"):
        try:
            scene.render.engine = eng
            return eng
        except TypeError:
            continue
    return scene.render.engine


def render(map_id):
    loc, target, elev, azim, cutaway, horizon = SHOTS[map_id]
    clear_scene()
    for l in list(bpy.data.lights):
        bpy.data.lights.remove(l)
    bpy.ops.import_scene.gltf(filepath=os.path.join(PROJECT, "public", "models", "maps", map_id + ".glb"))
    if cutaway:
        # Remove ceiling and roof so the rooms are visible from above.
        for o in bpy.context.scene.objects:
            if o.type != "MESH":
                continue
            bm = bmesh.new()
            bm.from_mesh(o.data)
            mw = o.matrix_world
            bmesh.ops.delete(bm, geom=[f for f in bm.faces if (mw @ f.calc_center_median()).z > 2.55], context="FACES")
            bm.to_mesh(o.data)
            bm.free()
    setup_world(elev, azim)
    if horizon:
        # Ground out to the horizon (in game, fog hides the map edge).
        box("horizon", (8000, 8000, 0.1), (0, 0, -0.3), mat("horizon_ground", horizon, rough=0.9))

    cam_data = bpy.data.cameras.new("preview_cam")
    cam_data.lens = 28
    cam_data.clip_end = 5000
    cam = bpy.data.objects.new("preview_cam", cam_data)
    bpy.context.scene.collection.objects.link(cam)
    cam.location = loc
    cam.rotation_euler = (Vector(target) - Vector(loc)).to_track_quat("-Z", "Y").to_euler()

    scene = bpy.context.scene
    scene.camera = cam
    set_engine(scene)
    scene.render.resolution_x = 800
    scene.render.resolution_y = 450
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "JPEG"
    scene.render.image_settings.quality = 82
    try:
        scene.view_settings.view_transform = "Standard"
        scene.view_settings.look = "None"
        scene.view_settings.exposure = -0.2
    except TypeError:
        pass
    path = os.path.join(PROJECT, "public", "previews", map_id + ".jpg")
    os.makedirs(os.path.dirname(path), exist_ok=True)
    scene.render.filepath = path
    bpy.ops.render.render(write_still=True)
    return path, os.path.getsize(path)


for mid in globals().get("PREVIEW_IDS") or list(SHOTS):
    print(render(mid))
