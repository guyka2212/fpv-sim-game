# Map-building helpers. Run after lib.py.
# Material names start with a surface tag (grass_, asphalt_, concrete_, ...) that the game uses
# to add a procedural texture; UVs are box-projected in world space at 1 UV unit = 1 m.
import random


def surf(tag, color, rough=0.85, metallic=0.0, alpha=1.0, emission=None, strength=1.0):
    return mat(tag, color, metallic=metallic, rough=rough, alpha=alpha, emission=emission, strength=strength)


def empty(name, loc, yaw_deg=0.0, size=0.5):
    e = bpy.data.objects.new(name, None)
    e.empty_display_size = size
    e.location = loc
    e.rotation_euler = (0, 0, math.radians(yaw_deg))
    bpy.context.scene.collection.objects.link(e)
    return e


def world_uv(objs):
    for o in objs:
        if o.type != "MESH":
            continue
        me = o.data
        bm = bmesh.new()
        bm.from_mesh(me)
        uv = bm.loops.layers.uv.verify()
        mw = o.matrix_world
        rot = mw.to_3x3()
        for f in bm.faces:
            n = rot @ f.normal
            ax, ay, az = abs(n.x), abs(n.y), abs(n.z)
            for loop in f.loops:
                w = mw @ loop.vert.co
                if az >= ax and az >= ay:
                    loop[uv].uv = (w.x, w.y)
                elif ax >= ay:
                    loop[uv].uv = (w.y, w.z)
                else:
                    loop[uv].uv = (w.x, w.z)
        bm.to_mesh(me)
        bm.free()


def wall(name, p0, p1, z0, height, thick, material, openings=()):
    """Straight wall from p0 to p1 (x,y). openings: (center_along, width, sill, top) in metres."""
    x0, y0 = p0
    x1, y1 = p1
    length = math.hypot(x1 - x0, y1 - y0)
    ang = math.atan2(y1 - y0, x1 - x0)
    dx, dy = (x1 - x0) / length, (y1 - y0) / length
    pieces = []

    def seg(a, b, zb, zt):
        if b - a < 1e-3 or zt - zb < 1e-3:
            return
        c = (a + b) / 2
        pieces.append(box(name, (b - a, thick, zt - zb), (x0 + dx * c, y0 + dy * c, z0 + (zb + zt) / 2), material, rot=(0, 0, ang)))

    cursor = 0.0
    for c, w, sill, top in sorted(openings):
        a, b = c - w / 2, c + w / 2
        seg(cursor, a, 0, height)
        seg(a, b, 0, sill)
        seg(a, b, top, height)
        cursor = b
    seg(cursor, length, 0, height)
    return pieces


def tree(name, loc, height, kind="round", trunk_mat=None, leaf_mat=None):
    x, y, z = loc
    parts = [cyl(name + "_trunk", height * 0.04, height * 0.45, (x, y, z + height * 0.225), trunk_mat, segs=7)]
    if kind == "pine":
        for i, (r, h, zz) in enumerate(((0.28, 0.45, 0.35), (0.22, 0.38, 0.55), (0.14, 0.32, 0.75))):
            parts.append(cyl(name + "_cone", height * r, height * h, (x, y, z + height * zz), leaf_mat, r2=0.0, segs=8, smooth=False))
    else:
        parts.append(sphere(name + "_crown", height * 0.3, (x, y, z + height * 0.68), leaf_mat, scale=(1, 1, 0.9), segs=10, rings=7))
    return parts


def gate_frame(name, loc, yaw_deg, inner_w=1.6, inner_h=1.6, bar=0.15, depth=0.15, mats=None, z_bottom=None, dive=False):
    """Square race gate, with a gate empty at its centre whose -Y/+Y axis is the flight direction."""
    x, y, z = loc
    mats = mats or {}
    m1 = mats.get("a")
    m2 = mats.get("b", m1)
    W = inner_w + 2 * bar
    zb = z if z_bottom is None else z_bottom
    parts = []
    if dive:
        # Horizontal gate lying flat at height z, flown through vertically.
        cz = z
        parts += [box(name, (W, bar, depth), (0, (inner_h + bar) / 2, 0), m1), box(name, (W, bar, depth), (0, -(inner_h + bar) / 2, 0), m1),
                  box(name, (bar, inner_h, depth), ((inner_w + bar) / 2, 0, 0), m2), box(name, (bar, inner_h, depth), (-(inner_w + bar) / 2, 0, 0), m2)]
        for sx in (-1, 1):
            for sy in (-1, 1):
                parts.append(cyl(name + "_leg", 0.05, cz, (sx * W / 2, sy * (inner_h / 2 + bar), -cz / 2), mats.get("pole", m1), segs=8))
        g = zero_origin(join(parts, name))
        g.location = (x, y, cz)
        g.rotation_euler = (0, 0, math.radians(yaw_deg))
        e = empty(name + "_marker", (x, y, cz))
        # Local +Y (flight direction) points down: dive gates are flown top to bottom.
        e.rotation_euler = (math.radians(-90), 0, math.radians(yaw_deg))
        return g, e
    cz = zb + bar + inner_h / 2
    parts += [box(name, (W, depth, bar), (0, 0, cz + (inner_h + bar) / 2 - zb), m1),
              box(name, (bar, depth, inner_h + bar * 2), (-(inner_w + bar) / 2, 0, cz - zb), m2),
              box(name, (bar, depth, inner_h + bar * 2), ((inner_w + bar) / 2, 0, cz - zb), m2)]
    if zb - z > 0.05 or zb > 0.2:
        for sx in (-1, 1):
            parts.append(cyl(name + "_leg", 0.05, zb + bar, (sx * (inner_w + bar) / 2, 0, (zb + bar) / 2 - zb), mats.get("pole", m1), segs=8))
    else:
        parts.append(box(name, (W, depth, bar), (0, 0, bar / 2), m1))
    g = zero_origin(join(parts, name))
    g.location = (x, y, zb)
    g.rotation_euler = (0, 0, math.radians(yaw_deg))
    e = empty(name + "_marker", (x, y, cz))
    e.rotation_euler = (0, 0, math.radians(yaw_deg))
    return g, e


def zero_origin(o):
    """Move the object's origin to the world origin without moving its geometry."""
    o.data.transform(Matrix.Translation(o.location) @ o.rotation_euler.to_matrix().to_4x4())
    o.location = (0, 0, 0)
    o.rotation_euler = (0, 0, 0)
    return o


def overlap_report(meshes, gap=0.03, min_area=0.02, cell=8.0, pairs=None):
    """Faces of different objects that lie in (almost) the same plane, face the same way and
    overlap: they flicker in the game. Returns the worst pairs by object name with the area."""
    from collections import defaultdict
    grid = defaultdict(list)
    faces = []
    for o in meshes:
        mw = o.matrix_world
        nm = mw.to_3x3().inverted().transposed()
        vco = [mw @ v.co for v in o.data.vertices]
        for p in o.data.polygons:
            if p.area < 1e-4:
                continue
            n = (nm @ p.normal).normalized()
            vs = [vco[i] for i in p.vertices]
            lo = [min(v[k] for v in vs) for k in range(3)]
            hi = [max(v[k] for v in vs) for k in range(3)]
            if n.z < -0.9 and hi[2] < 0.3:
                continue  # undersides resting on the ground are never seen
            d = n.dot(vs[0])
            ax = max(range(3), key=lambda k: abs(n[k]))
            u, w = [k for k in range(3) if k != ax]
            fi = len(faces)
            faces.append((o.name, d, lo, hi, u, w, n))
            key = (round(n.x, 2), round(n.y, 2), round(n.z, 2), int(math.floor(d / gap)))
            for cu in range(int(lo[u] // cell), int(hi[u] // cell) + 1):
                for cw in range(int(lo[w] // cell), int(hi[w] // cell) + 1):
                    grid[key + (cu, cw)].append(fi)
    # Object boxes, to skip overlaps buried inside a third object (never seen).
    boxes = defaultdict(list)
    for o in meshes:
        cs = [o.matrix_world @ Vector(c) for c in o.bound_box]
        lo = [min(c[k] for c in cs) for k in range(3)]
        hi = [max(c[k] for c in cs) for k in range(3)]
        for cx in range(int(lo[0] // cell), int(hi[0] // cell) + 1):
            for cy in range(int(lo[1] // cell), int(hi[1] // cell) + 1):
                boxes[(cx, cy)].append((o.name, lo, hi))

    def buried(pt, skip):
        for nm, lo, hi in boxes.get((int(pt[0] // cell), int(pt[1] // cell)), ()):
            if nm not in skip and all(lo[k] + 0.002 < pt[k] < hi[k] - 0.002 for k in range(3)):
                return True
        return False

    seen = set()
    hits = defaultdict(float)
    for key, ids in grid.items():
        nxt = grid.get(key[:3] + (key[3] + 1,) + key[4:], [])
        for x, i in enumerate(ids):
            a = faces[i]
            for j in ids[x + 1:] + nxt:
                b = faces[j]
                if b[0] == a[0] or abs(a[1] - b[1]) > gap or (min(i, j), max(i, j)) in seen:
                    continue
                seen.add((min(i, j), max(i, j)))
                u, w = a[4], a[5]
                area = max(0.0, min(a[3][u], b[3][u]) - max(a[2][u], b[2][u])) * max(0.0, min(a[3][w], b[3][w]) - max(a[2][w], b[2][w]))
                if area > min_area:
                    n = a[6]
                    pt = [0.0, 0.0, 0.0]
                    for k in (u, w):
                        pt[k] = (max(a[2][k], b[2][k]) + min(a[3][k], b[3][k])) / 2
                    ax = 3 - u - w
                    pt[ax] = (max(a[3][ax], b[3][ax]) if n[ax] > 0 else min(a[2][ax], b[2][ax])) + 0.01 * (1 if n[ax] > 0 else -1)
                    if buried(pt, (a[0], b[0])):
                        continue
                    na, nb = sorted((a[0].split(".")[0], b[0].split(".")[0]))
                    hits[(na, nb, round(abs(a[1] - b[1]), 3))] += area
                    if pairs is not None and abs(a[1] - b[1]) < 0.006:
                        pairs.append((a[0], b[0], n))
    return sorted(hits.items(), key=lambda kv: -kv[1])


def separate_coplanar(meshes, step=0.012):
    """Surfaces of two parts lying flat on each other flicker in the game: move the smaller part
    a centimetre forward, out of the shared plane. Repeats while it still finds some."""
    by_name = {o.name: o for o in meshes}
    vol = {}
    for o in meshes:
        dx, dy, dz = o.dimensions
        vol[o.name] = max(dx, 1e-3) * max(dy, 1e-3) * max(dz, 1e-3)
    moved = 0
    for _ in range(3):
        pairs = []
        overlap_report(meshes, gap=0.006, pairs=pairs)
        if not pairs:
            break
        done = set()
        for a, b, n in pairs:
            o = by_name[a if vol[a] <= vol[b] else b]
            if o.name in done:
                continue
            done.add(o.name)
            o.location += Vector(n) * step
            moved += 1
        bpy.context.view_layer.update()
    return moved


def finish_map(rel_path, merge=True):
    """World-space UVs, merge meshes by material to cut draw calls, then export."""
    meshes = [o for o in bpy.context.scene.objects if o.type == "MESH"]
    if globals().get("CHECK_OVERLAPS"):
        return overlap_report(meshes)
    print("separated %d flat overlaps" % separate_coplanar(meshes))
    world_uv(meshes)
    if merge and len(meshes) > 1:
        join(meshes, "map")
    # Gate/spawn/light markers: name them simply for the game.
    for o in bpy.context.scene.objects:
        if o.type == "EMPTY" and o.name.endswith("_marker"):
            o.name = o.name[: -len("_marker")]
    return export_glb(rel_path, compress=True)


def car(name, loc, yaw_deg, color):
    x, y, z = loc
    body_m = surf("paint_car_%02x%02x%02x" % tuple(int(c * 255) for c in color), color, rough=0.25, metallic=0.6)
    glass = surf("glass_car", (0.05, 0.07, 0.1), rough=0.05, metallic=0.3)
    tyre = surf("rubber", (0.02, 0.02, 0.02), rough=0.9)
    parts = [box(name, (1.8, 4.3, 0.75), (0, 0, 0.65), body_m, bevel=0.12),
             box(name + "_cab", (1.6, 2.2, 0.6), (0, -0.2, 1.3), glass, bevel=0.1)]
    for sx in (-1, 1):
        for sy in (-1.35, 1.35):
            parts.append(cyl(name + "_wheel", 0.34, 0.25, (sx * 0.85, sy, 0.34), tyre, rot=(0, math.radians(90), 0), segs=14))
    c = zero_origin(join(parts, name))
    c.location = (x, y, z)
    c.rotation_euler = (0, 0, math.radians(yaw_deg))
    return c


# ---------------------------------------------------------------- big structures

class Mesher:
    """Collects many boxes and beams into one bmesh per material, so lattice towers and stands
    with thousands of parts become a handful of objects."""

    def __init__(self):
        self.bms = {}

    def _bm(self, m):
        if m.name not in self.bms:
            self.bms[m.name] = (bmesh.new(), m)
        return self.bms[m.name][0]

    def cube(self, m, size, loc, rot=(0, 0, 0)):
        bm = self._bm(m)
        xf = Matrix.Translation(loc) @ Euler(rot).to_matrix().to_4x4()
        for v in bmesh.ops.create_cube(bm, size=1.0)["verts"]:
            v.co = xf @ Vector((v.co.x * size[0], v.co.y * size[1], v.co.z * size[2]))

    def beam(self, m, a, b, t, w=None, ext=0.0, roll=None):
        """Square beam t x w from a to b; ext lengthens both ends (fills joints)."""
        a, b = Vector(a), Vector(b)
        d = b - a
        L = d.length
        if L < 1e-4:
            return
        # Local Y points up (world Z), so a flat beam stays flat whichever way it runs.
        up = "Y" if abs(d.normalized().z) < 0.95 else "X"
        xf = Matrix.Translation((a + b) / 2) @ d.to_track_quat("Z", up).to_matrix().to_4x4()
        if roll:
            xf = xf @ Matrix.Rotation(roll, 4, "Z")
        bm = self._bm(m)
        for v in bmesh.ops.create_cube(bm, size=1.0)["verts"]:
            v.co = xf @ Vector((v.co.x * t, v.co.y * (w or t), v.co.z * (L + 2 * ext)))

    def done(self, name):
        objs = [_obj_from_bm(name, bm, m) for bm, m in self.bms.values()]
        self.bms = {}
        return objs


def sweep(name, path, profile, mats, mat_of=None, closed=True):
    """Sweep a closed 2D profile [(d, z), ...] along a path [(x, y, nx, ny), ...], where d is the
    offset along the path's outward normal. mat_of(j) gives the material index of profile edge j."""
    bm = bmesh.new()
    rows = [[bm.verts.new((x + nx * d, y + ny * d, z)) for d, z in profile] for x, y, nx, ny in path]
    n, m = len(profile), len(path)
    for i in range(m if closed else m - 1):
        a, b = rows[i], rows[(i + 1) % m]
        for j in range(n):
            k = (j + 1) % n
            f = bm.faces.new((a[j], b[j], b[k], a[k]))
            f.material_index = mat_of(j) if mat_of else 0
    if not closed:
        for r in (rows[0], rows[-1]):
            f = bm.faces.new(r)
            f.material_index = mat_of(-1) if mat_of else 0
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    o = _obj_from_bm(name, bm, mats[0])
    for mt in mats[1:]:
        o.data.materials.append(mt)
    return o


def rounded_rect(hx, hy, r, step=5.0, arc_steps=10):
    """Closed loop around a rounded rectangle, counter-clockwise: [(x, y, nx, ny), ...]."""
    pts = []
    corners = [(hx - r, hy - r), (-(hx - r), hy - r), (-(hx - r), -(hy - r)), (hx - r, -(hy - r))]
    for c, (cx, cy) in enumerate(corners):
        a0 = c * math.pi / 2
        for k in range(arc_steps + 1):
            a = a0 + k * (math.pi / 2) / arc_steps
            pts.append((cx + math.cos(a) * r, cy + math.sin(a) * r, math.cos(a), math.sin(a)))
        # Straight side to the next corner (interior points only).
        nx_, ny_ = corners[(c + 1) % 4]
        ex, ey = cx + math.cos(a0 + math.pi / 2) * r, cy + math.sin(a0 + math.pi / 2) * r
        fx, fy = nx_ + math.cos(a0 + math.pi / 2) * r, ny_ + math.sin(a0 + math.pi / 2) * r
        L = math.hypot(fx - ex, fy - ey)
        steps = max(1, int(L / step))
        for k in range(1, steps):
            t = k / steps
            pts.append((ex + (fx - ex) * t, ey + (fy - ey) * t, math.cos(a0 + math.pi / 2), math.sin(a0 + math.pi / 2)))
    return pts


def terrain(name, x0, x1, y0, y1, cell, hfn, mats, pick=None):
    """Height-field grid. pick(cx, cy, cz, normal_z) returns a material index per face."""
    nx_, ny_ = max(1, int((x1 - x0) / cell)), max(1, int((y1 - y0) / cell))
    bm = bmesh.new()
    grid = []
    for j in range(ny_ + 1):
        y = y0 + (y1 - y0) * j / ny_
        grid.append([bm.verts.new((x0 + (x1 - x0) * i / nx_, y, 0)) for i in range(nx_ + 1)])
    for row in grid:
        for v in row:
            v.co.z = hfn(v.co.x, v.co.y)
    for j in range(ny_):
        for i in range(nx_):
            bm.faces.new((grid[j][i], grid[j][i + 1], grid[j + 1][i + 1], grid[j + 1][i]))
    bm.normal_update()
    if pick:
        for f in bm.faces:
            c = f.calc_center_median()
            f.material_index = pick(c.x, c.y, c.z, f.normal.z)
    o = _obj_from_bm(name, bm, mats[0])
    for mt in mats[1:]:
        o.data.materials.append(mt)
    for p in o.data.polygons:
        p.use_smooth = True
    return o


def boat(name, loc, yaw_deg, length, color, sail=False):
    """Small boat floating at loc (waterline): pointed hull, deck, optional mast and sail."""
    x, y, z = loc
    hull_m = surf("paint_hull_%02x%02x%02x" % tuple(int(c * 255) for c in color), color, rough=0.3)
    deck_m = surf("wood_deck", (0.62, 0.48, 0.32))
    W = length * 0.36
    bm = bmesh.new()
    prof = [(-0.5, 0.6), (0.3, 0.75), (0.5, 0.0), (0.3, -0.75), (-0.5, -0.6)]  # top view, x along the boat
    lo = [bm.verts.new((px * length * 0.95, py * W * 0.35, -0.35)) for px, py in prof]
    hi = [bm.verts.new((px * length, py * W * 0.5, 0.45)) for px, py in prof]
    k = len(prof)
    for i in range(k):
        bm.faces.new((lo[i], lo[(i + 1) % k], hi[(i + 1) % k], hi[i]))
    bm.faces.new(lo[::-1])
    bm.faces.new(hi)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    parts = [_obj_from_bm(name, bm, hull_m)]
    parts.append(box(name + "_deck", (length * 0.55, W * 0.62, 0.06), (-length * 0.1, 0, 0.47), deck_m))
    if sail:
        mast = surf("metal_mast", (0.85, 0.85, 0.86), metallic=0.6, rough=0.3)
        parts.append(cyl(name + "_mast", 0.06, length * 1.3, (length * 0.05, 0, 0.45 + length * 0.65), mast, segs=8))
        parts.append(box(name + "_boom", (length * 0.5, 0.08, 0.08), (-length * 0.2, 0, 1.4), mast))
        bm = bmesh.new()
        a = bm.verts.new((length * 0.03, 0, 1.5))
        b = bm.verts.new((length * 0.03, 0, 0.45 + length * 1.25))
        c = bm.verts.new((-length * 0.43, 0, 1.5))
        bm.faces.new((a, b, c))
        parts.append(_obj_from_bm(name + "_sail", bm, surf("fabric_sail", (0.95, 0.94, 0.9), rough=0.8)))
        bm = bmesh.new()  # the sail seen from both sides
        a = bm.verts.new((length * 0.03, 0.02, 1.5))
        b = bm.verts.new((-length * 0.43, 0.02, 1.5))
        c = bm.verts.new((length * 0.03, 0.02, 0.45 + length * 1.25))
        bm.faces.new((a, b, c))
        parts.append(_obj_from_bm(name + "_sail", bm, surf("fabric_sail", (0.95, 0.94, 0.9), rough=0.8)))
    else:
        parts.append(box(name + "_cabin", (length * 0.25, W * 0.5, 0.6), (length * 0.08, 0, 0.8), surf("paint_white", (0.92, 0.92, 0.9), rough=0.5)))
        parts.append(box(name + "_screen", (0.05, W * 0.48, 0.4), (length * 0.21, 0, 1.0), surf("glass_boat", (0.2, 0.3, 0.35), rough=0.05), rot=(0, math.radians(-30), 0)))
    o = zero_origin(join(parts, name))
    o.location = (x, y, z)
    o.rotation_euler = (0, 0, math.radians(yaw_deg))
    return o
