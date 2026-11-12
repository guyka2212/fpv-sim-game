# Helpers for closed race circuits. Run after lib.py and maplib.py.
# A track is a list of samples every STEP metres: position (x, y, z), unit tangent, unit right
# vector in the ground plane, and bank angle (radians, positive = outside edge higher).
import json


def catmull_closed(ctrl, step=2.0):
    """Closed centripetal-ish Catmull-Rom through ctrl points (x, y), resampled every step metres."""
    dense = []
    n = len(ctrl)
    for i in range(n):
        p0, p1, p2, p3 = (Vector((*ctrl[(i + k) % n], 0)) for k in (-1, 0, 1, 2))
        for s in range(40):
            t = s / 40
            t2, t3 = t * t, t * t * t
            dense.append(0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3))
    return resample(dense, step)


def resample(pts, step):
    out = [pts[0].copy()]
    acc = 0.0
    n = len(pts)
    for i in range(1, n + 1):
        a, b = pts[i - 1], pts[i % n]
        seg = (b - a).length
        while acc + seg >= step:
            t = (step - acc) / seg
            a = a.lerp(b, t)
            out.append(a.copy())
            seg = (b - a).length
            acc = 0.0
        acc += seg
    if (out[-1] - out[0]).length < step * 0.5:
        out.pop()
    return out


def frames(pts):
    """Tangent, right vector and signed curvature (1/m, + = turning left) at every sample."""
    n = len(pts)
    tan, right, curv = [], [], []
    for i in range(n):
        d = pts[(i + 1) % n] - pts[i - 1]
        d.z = 0
        d.normalize()
        tan.append(d)
        right.append(Vector((d.y, -d.x, 0)))
    for i in range(n):
        a, b = tan[i - 2], tan[(i + 2) % n]
        ang = math.atan2(a.x * b.y - a.y * b.x, a.dot(b))
        dist = (pts[(i + 2) % n] - pts[i - 2]).length
        curv.append(ang / max(dist, 1e-3))
    return tan, right, curv


def smooth(vals, k):
    n = len(vals)
    out = []
    for i in range(n):
        out.append(sum(vals[(i + j) % n] for j in range(-k, k + 1)) / (2 * k + 1))
    return out


def edge_point(p, r, bank, off, lift=0.0):
    """Point off metres to the right of the centre line on a road banked by bank radians."""
    return Vector((p.x + r.x * off * math.cos(bank), p.y + r.y * off * math.cos(bank), p.z + off * math.sin(bank) + lift))


def ribbon(name, pts, right, banks, off0, off1, lift, material, mask=None, close=True):
    """Strip of quads between lateral offsets off0..off1 along the track. mask[i] False skips segment i."""
    bm = bmesh.new()
    n = len(pts)
    rows = []
    for i in range(n):
        rows.append((bm.verts.new(edge_point(pts[i], right[i], banks[i], off0, lift)), bm.verts.new(edge_point(pts[i], right[i], banks[i], off1, lift))))
    for i in range(n if close else n - 1):
        if mask is not None and not mask[i]:
            continue
        a, b = rows[i], rows[(i + 1) % n]
        f = bm.faces.new((a[0], b[0], b[1], a[1]))
        if f.normal.z < 0:
            f.normal_flip()
    bm.verts.ensure_lookup_table()
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context="VERTS")
    return _obj_from_bm(name, bm, material)


def wall_strip(name, pts, right, banks, off, height, thick, material, mask=None, base_lift=0.0):
    """Solid wall running along the track at lateral offset off (closed box section)."""
    bm = bmesh.new()
    n = len(pts)
    rows = []
    for i in range(n):
        p, r, b = pts[i], right[i], banks[i]
        lo = edge_point(p, r, b, off - thick / 2, base_lift)
        hi = edge_point(p, r, b, off + thick / 2, base_lift)
        rows.append([bm.verts.new(lo), bm.verts.new(hi), bm.verts.new(hi + Vector((0, 0, height))), bm.verts.new(lo + Vector((0, 0, height)))])
    runs = []
    for i in range(n):
        if mask is None or mask[i]:
            a, b = rows[i], rows[(i + 1) % n]
            for k in range(4):
                bm.faces.new((a[k], b[k], b[(k + 1) % 4], a[(k + 1) % 4]))
    # Cap the ends of each run.
    if mask is not None:
        for i in range(n):
            if mask[i] and not mask[i - 1]:
                bm.faces.new(list(reversed(rows[i])))
            if mask[i] and not mask[(i + 1) % n]:
                bm.faces.new(rows[(i + 1) % n])
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context="VERTS")
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return _obj_from_bm(name, bm, material)


def clear_of_track(pts, x, y, dist, skip_near=None):
    """True if (x, y) is at least dist metres from every track sample (optionally ignoring samples near index skip_near)."""
    d2 = dist * dist
    n = len(pts)
    for i, p in enumerate(pts):
        if skip_near is not None and min(abs(i - skip_near), n - abs(i - skip_near)) < 25:
            continue
        if (p.x - x) ** 2 + (p.y - y) ** 2 < d2:
            return False
    return True


def export_track(rel_path, pts, right, banks, width, start_index=0, extra=None):
    """Driving line for the game, in three.js axes (x, y up, z = -blender y)."""
    data = {
        "width": width,
        "start": start_index,
        "points": [[round(p.x, 3), round(p.z, 3), round(-p.y, 3)] for p in pts],
        "bank": [round(b, 4) for b in banks],
    }
    if extra:
        data.update(extra)
    path = os.path.join(PROJECT, rel_path)
    with open(path, "w") as f:
        json.dump(data, f, separators=(",", ":"))
    return path, os.path.getsize(path)
