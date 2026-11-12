# Shared helpers for building the sim's models with bpy/bmesh.
# Blender axes: +X right, +Y forward (nose), +Z up. glTF export turns +Y forward into -Z (three.js forward).
import bpy, bmesh, math, os
from mathutils import Vector, Matrix, Euler

PROJECT = r"C:\Users\User\Documents\fly-sim"


def clear_scene():
    for o in list(bpy.data.objects):
        bpy.data.objects.remove(o, do_unlink=True)
    for coll in (bpy.data.meshes, bpy.data.materials, bpy.data.curves, bpy.data.images):
        for x in list(coll):
            if x.users == 0:
                coll.remove(x)


def _set(bsdf, ident, value):
    for i in bsdf.inputs:
        if i.identifier == ident:
            i.default_value = value
            return


def mat(name, color, metallic=0.0, rough=0.5, emission=None, strength=1.0, alpha=1.0):
    m = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    m.use_nodes = True
    bsdf = next(n for n in m.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    _set(bsdf, "Base Color", (*color, 1))
    _set(bsdf, "Metallic", metallic)
    _set(bsdf, "Roughness", rough)
    if emission:
        _set(bsdf, "Emission Color", (*emission, 1))
        _set(bsdf, "Emission Strength", strength)
    if alpha < 1:
        _set(bsdf, "Alpha", alpha)
        try:
            m.surface_render_method = "BLENDED"
        except Exception:
            pass
    m.diffuse_color = (*color, alpha)
    return m


def _obj_from_bm(name, bm, material, loc=(0, 0, 0), rot=(0, 0, 0), parent=None):
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    for p in me.polygons:
        p.use_smooth = False
    if material is not None:
        me.materials.append(material)
    o = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(o)
    o.location = loc
    o.rotation_euler = rot
    if parent:
        o.parent = parent
    return o


def box(name, size, loc=(0, 0, 0), material=None, rot=(0, 0, 0), bevel=0.0):
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    for v in bm.verts:
        v.co = Vector((v.co.x * size[0], v.co.y * size[1], v.co.z * size[2]))
    if bevel > 0:
        bmesh.ops.bevel(bm, geom=list(bm.edges), offset=bevel, segments=2, affect="EDGES")
    return _obj_from_bm(name, bm, material, loc, rot)


def cyl(name, r, depth, loc=(0, 0, 0), material=None, rot=(0, 0, 0), segs=24, r2=None, smooth=True):
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=segs, radius1=r, radius2=r if r2 is None else r2, depth=depth)
    o = _obj_from_bm(name, bm, material, loc, rot)
    if smooth:
        # Smooth the sides, keep caps flat.
        for p in o.data.polygons:
            p.use_smooth = abs(p.normal.z) < 0.5
    return o


def sphere(name, r, loc=(0, 0, 0), material=None, scale=(1, 1, 1), segs=16, rings=10):
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=segs, v_segments=rings, radius=r)
    for v in bm.verts:
        v.co = Vector((v.co.x * scale[0], v.co.y * scale[1], v.co.z * scale[2]))
    o = _obj_from_bm(name, bm, material, loc)
    for p in o.data.polygons:
        p.use_smooth = True
    return o


def ring(name, r_in, r_out, height, loc=(0, 0, 0), material=None, segs=40, lip=0.0):
    """Hollow tube (duct / prop guard). Optional lip flares the top edge outward."""
    bm = bmesh.new()
    h = height / 2
    prof = [(r_in, -h), (r_out, -h), (r_out + lip, h), (r_in, h)]
    verts = [bm.verts.new((x, 0, z)) for x, z in prof]
    edges = [bm.edges.new((verts[i], verts[(i + 1) % 4])) for i in range(4)]
    bmesh.ops.spin(bm, geom=verts + edges, cent=(0, 0, 0), axis=(0, 0, 1), angle=math.tau, steps=segs, use_duplicate=False)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-6)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    o = _obj_from_bm(name, bm, material, loc)
    for p in o.data.polygons:
        p.use_smooth = abs(p.normal.z) < 0.5
    return o


def prop(name, radius, blades, material, hub_material, loc, cw, chord=None, pitch_deg=14):
    """Prop with tapered, twisted blades; origin at the hub so it can spin about local Z."""
    chord = chord or radius * 0.24
    bm = bmesh.new()
    for b in range(blades):
        tmp = bmesh.new()
        bmesh.ops.create_cube(tmp, size=1.0)
        segs = bmesh.ops.subdivide_edges(tmp, edges=[e for e in tmp.edges if abs((e.verts[0].co - e.verts[1].co).x) > 0.5], cuts=4)
        for v in tmp.verts:
            t = v.co.x + 0.5  # 0 at hub, 1 at tip
            x = radius * (0.08 + 0.92 * t)
            w = chord * (1.0 - 0.45 * t) * (0.6 if t < 0.08 else 1.0)
            y = v.co.y * w
            z = v.co.z * radius * 0.035
            # Twist: steeper near the hub, flatter at the tip. Sign follows spin direction.
            ang = math.radians(pitch_deg * (1.6 - 0.9 * t)) * (1 if cw else -1)
            y2 = y * math.cos(ang) - z * math.sin(ang)
            z2 = y * math.sin(ang) + z * math.cos(ang)
            # Round the tip slightly.
            if t > 0.9:
                y2 *= 1 - (t - 0.9) * 4
            v.co = Vector((x, y2, z2))
        rot = Matrix.Rotation(math.tau * b / blades, 4, "Z")
        tmp.transform(rot)
        me = bpy.data.meshes.new("tmp")
        tmp.to_mesh(me)
        tmp.free()
        bm.from_mesh(me)
        bpy.data.meshes.remove(me)
    o = _obj_from_bm(name, bm, material, loc)
    hub = cyl(name + "_hub", radius * 0.11, radius * 0.12, (0, 0, 0), hub_material, segs=16)
    nut = cyl(name + "_nut", radius * 0.06, radius * 0.1, (0, 0, radius * 0.09), hub_material, segs=6)
    join([o, hub, nut], name, keep_origin_of=o)
    return bpy.data.objects[name]


def join(objs, name, keep_origin_of=None):
    """Join objects into one, keeping the first (or given) object's origin."""
    target = keep_origin_of or objs[0]
    for o in objs:
        o.select_set(o in objs)
    bpy.context.view_layer.objects.active = target
    with bpy.context.temp_override(active_object=target, selected_editable_objects=objs, selected_objects=objs):
        bpy.ops.object.join()
    target.name = name
    target.data.name = name
    return target


def arm_bar(name, start, end, width, thick, z, material, round_end=True):
    """Flat carbon arm from start (x,y) to end (x,y), with a rounded motor pad."""
    sx, sy = start
    ex, ey = end
    dx, dy = ex - sx, ey - sy
    length = math.hypot(dx, dy)
    ang = math.atan2(dy, dx)
    o = box(name, (length, width, thick), ((sx + ex) / 2, (sy + ey) / 2, z), material, rot=(0, 0, ang))
    parts = [o]
    if round_end:
        parts.append(cyl(name + "_pad", width * 0.95, thick, (ex, ey, z), material, segs=20, smooth=False))
    return join(parts, name)


def motor(name, loc, stator_r, bell_r, bell_h, bell_mat, stator_mat, metal_mat):
    x, y, z = loc
    base = cyl(name + "_base", bell_r * 0.95, bell_h * 0.15, (x, y, z + bell_h * 0.075), metal_mat)
    stator = cyl(name + "_stator", stator_r, bell_h * 0.3, (x, y, z + bell_h * 0.3), stator_mat)
    bell = cyl(name + "_bell", bell_r, bell_h * 0.6, (x, y, z + bell_h * 0.7), bell_mat, segs=28)
    cap = cyl(name + "_cap", bell_r * 0.75, bell_h * 0.06, (x, y, z + bell_h * 1.03), metal_mat, segs=28)
    shaft = cyl(name + "_shaft", bell_r * 0.15, bell_h * 0.5, (x, y, z + bell_h * 1.2), metal_mat, segs=10)
    return join([base, stator, bell, cap, shaft], name)


def fpv_camera(name, size, loc, uptilt_deg, body_mat, lens_mat, glass_mat):
    s = size
    body = box(name, (s, s * 0.9, s), (0, 0, 0), body_mat, bevel=s * 0.08)
    lens = cyl(name + "_lens", s * 0.36, s * 0.45, (0, s * 0.6, 0), lens_mat, rot=(math.radians(90), 0, 0), segs=20)
    glass = cyl(name + "_glass", s * 0.26, s * 0.05, (0, s * 0.84, 0), glass_mat, rot=(math.radians(90), 0, 0), segs=20)
    cam = join([body, lens, glass], name)
    cam.location = loc
    cam.rotation_euler = (math.radians(uptilt_deg), 0, 0)
    return cam


def antenna(name, base, direction, length, mat_stick, mat_tip):
    d = Vector(direction).normalized()
    mid = Vector(base) + d * length / 2
    rot = d.to_track_quat("Z", "Y").to_euler()
    stick = cyl(name, 0.0018, length, tuple(mid), mat_stick, rot=tuple(rot), segs=8)
    tip = cyl(name + "_tip", 0.004, 0.012, tuple(Vector(base) + d * length), mat_tip, rot=tuple(rot), segs=10)
    return join([stick, tip], name)


def apply_transforms(objs):
    for o in bpy.context.scene.objects:
        o.select_set(o in objs)
    with bpy.context.temp_override(selected_editable_objects=objs, selected_objects=objs):
        bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)


def export_glb(rel_path, objs=None, compress=False):
    path = os.path.join(PROJECT, rel_path)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    objs = objs or list(bpy.context.scene.objects)
    for o in bpy.context.scene.objects:
        o.select_set(o in objs)
    # Compressed maps are written plain first, then packed by meshopt-pack.mjs: Blender's own
    # meshopt option rounds vertices to a coarse grid, which merges trims back into their walls.
    out = path + ".raw.glb" if compress else path
    bpy.ops.export_scene.gltf(
        filepath=out,
        export_format="GLB",
        use_selection=True,
        export_apply=True,
        export_yup=True,
        export_extras=True,
    )
    if compress:
        import subprocess, shutil
        node = shutil.which("node") or r"C:\Program Files\nodejs\node.exe"
        script = os.path.join(PROJECT, "blender", "meshopt-pack.mjs")
        r = subprocess.run([node, script, out, path], cwd=PROJECT, capture_output=True, text=True)
        print(r.stdout.strip(), r.stderr.strip())
        if r.returncode:
            raise RuntimeError("meshopt-pack failed: " + r.stderr)
        os.remove(out)
    return path, os.path.getsize(path)


# ---------------------------------------------------------------- shared drone builder

def build_quad(p):
    """Build a quad from a parameter dict. Props are named prop_FL/FR/RL/RR, the FPV camera fpv_cam."""
    clear_scene()
    carbon = mat("carbon", (0.025, 0.025, 0.03), metallic=0.3, rough=0.32)
    alu = mat("alu", (0.6, 0.6, 0.62), metallic=1.0, rough=0.3)
    copper = mat("copper", (0.72, 0.36, 0.12), metallic=1.0, rough=0.35)
    bell_m = mat("bell", p["bell_color"], metallic=0.85, rough=0.28)
    prop_m = mat("prop", p["prop_color"], rough=0.35, alpha=p.get("prop_alpha", 1.0))
    black = mat("black_plastic", (0.02, 0.02, 0.02), rough=0.6)
    glass = mat("lens_glass", (0.05, 0.08, 0.12), metallic=0.5, rough=0.05)
    tpu = mat("tpu", p.get("tpu_color", (0.9, 0.3, 0.05)), rough=0.7)
    pcb = mat("pcb", (0.05, 0.25, 0.12), rough=0.5)
    red = mat("red", (0.8, 0.05, 0.05), rough=0.5)

    a = p["arm"]
    body_parts = []
    motor_z = p["motor_z"]
    names = {(-1, 1): "FL", (1, 1): "FR", (-1, -1): "RL", (1, -1): "RR"}
    # Same order/directions as src/drones/specs.ts motorLayout (props-in: FL/RR clockwise).
    cw_map = {"RR": True, "FR": False, "RL": False, "FL": True}
    if p.get("props_out"):
        cw_map = {k: not v for k, v in cw_map.items()}

    for (sx, sy), nm in names.items():
        mx, my = sx * a, sy * a
        if p.get("arm_width"):
            body_parts.append(arm_bar("arm_" + nm, (sx * p["arm_root"], sy * p["arm_root"]), (mx, my), p["arm_width"], p["arm_thick"], p["arm_thick"] / 2, carbon))
        body_parts.append(motor("motor_" + nm, (mx, my, motor_z), p["stator_r"], p["bell_r"], p["bell_h"], bell_m, copper, alu))
        if p.get("duct"):
            d = p["duct"]
            body_parts.append(ring("duct_" + nm, d["r_in"], d["r_in"] + d["wall"], d["h"], (mx, my, d["z"]), mat("duct", d["color"], rough=0.55), lip=d.get("lip", 0)))
        pz = motor_z + p["bell_h"] * 1.12
        prop(f"prop_{nm}", p["prop_r"], p["blades"], prop_m, black, (mx, my, pz), cw_map[nm], pitch_deg=p.get("pitch_deg", 14))

    # Centre plates and stack.
    if p.get("bottom_plate"):
        w, l, t = p["bottom_plate"]
        body_parts.append(box("bottom_plate", (w, l, t), (0, 0, t / 2), carbon, bevel=0.002))
    if p.get("top_plate"):
        w, l, t, z = p["top_plate"]
        body_parts.append(box("top_plate", (w, l, t), (0, 0, z), carbon, bevel=0.002))
        sh = z - p.get("standoff_base", 0.004)
        for sx in (-1, 1):
            for sy in (-1, 1):
                body_parts.append(cyl("standoff", 0.0025, sh, (sx * (w / 2 - 0.004), sy * (l / 2 - 0.006), p.get("standoff_base", 0.004) + sh / 2), alu, segs=8))
    if p.get("stack"):
        s, z = p["stack"]
        body_parts.append(box("stack_esc", (s, s, s * 0.12), (0, 0, z), pcb))
        body_parts.append(box("stack_fc", (s * 0.9, s * 0.9, s * 0.1), (0, 0, z + s * 0.25), pcb))
        body_parts.append(cyl("cap_esc", s * 0.13, s * 0.35, (s * 0.35, -s * 0.85, z), mat("cap", (0.15, 0.15, 0.18), metallic=0.8, rough=0.3), rot=(math.radians(90), 0, 0), segs=12))

    # Battery with strap.
    bw, bl, bh, bz = p["battery"]
    bat_m = mat("battery", p.get("battery_color", (0.05, 0.12, 0.35)), rough=0.4)
    body_parts.append(box("battery", (bw, bl, bh), (0, p.get("battery_y", 0), bz), bat_m, bevel=0.003))
    body_parts.append(box("battery_label", (bw * 1.01, bl * 0.35, bh * 0.6), (0, p.get("battery_y", 0) + bl * 0.15, bz), mat("label", (0.9, 0.85, 0.2), rough=0.5)))
    if p.get("strap", True):
        body_parts.append(box("strap", (bw * 1.06, 0.012, bh * 1.06), (0, p.get("battery_y", 0) - bl * 0.18, bz), red))
    body_parts.append(cyl("xt_lead", 0.003, 0.03, (0.006, p.get("battery_y", 0) - bl / 2 - 0.012, bz), red, rot=(math.radians(90), 0, 0), segs=8))

    # Optional parts.
    for extra in p.get("extras", []):
        body_parts.append(extra(locals()))

    body = join(body_parts, "body")

    cam = fpv_camera("fpv_cam", p["cam_size"], p["cam_loc"], p["uptilt"], black, black, glass)
    if p.get("cam_mount", True):
        cs = p["cam_size"]
        cx, cy, cz = p["cam_loc"]
        sides = [box("cam_side_" + str(i), (0.0025, cs * 1.2, cs * 1.3), (sx * (cs / 2 + 0.002), cy, cz), tpu) for i, sx in enumerate((-1, 1))]
        join(sides, "cam_mount")
    return body
