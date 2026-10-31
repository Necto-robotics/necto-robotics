"""Shared helpers for the scripted Loom assets.

Everything here builds geometry from nothing: no external .blend is ever
opened. Units are metres, Blender Z-up, robot +X forward. The glTF exporter
converts to three.js Y-up (+X stays forward, Blender +Y becomes three -Z).
"""
import math
import bmesh
import bpy
from mathutils import Matrix, Vector


def reset_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    for block in (bpy.data.meshes, bpy.data.materials, bpy.data.objects):
        for item in list(block):
            block.remove(item)


# ---------------------------------------------------------------- materials

def material(name, base, metal=0.0, rough=0.5, coat=0.0, coat_rough=0.1,
             emit=None, emit_strength=0.0, alpha=1.0):
    m = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    m.use_nodes = True
    bsdf = m.node_tree.nodes.get("Principled BSDF")
    if isinstance(base, (int, float)):
        base = (base, base, base)
    bsdf.inputs["Base Color"].default_value = (*base, 1.0)
    bsdf.inputs["Metallic"].default_value = metal
    bsdf.inputs["Roughness"].default_value = rough
    bsdf.inputs["Coat Weight"].default_value = coat
    bsdf.inputs["Coat Roughness"].default_value = coat_rough
    if emit is not None:
        bsdf.inputs["Emission Color"].default_value = (*emit, 1.0)
        bsdf.inputs["Emission Strength"].default_value = emit_strength
    if alpha < 1.0:
        bsdf.inputs["Alpha"].default_value = alpha
    return m


def palette():
    """The worker's material set: monochrome, physically plausible."""
    return {
        "shell": material("polymer_white", 0.80, rough=0.36, coat=0.25, coat_rough=0.25),
        "shell_dark": material("polymer_graphite", 0.035, rough=0.42, coat=0.2, coat_rough=0.3),
        "alu": material("alu_blasted", 0.86, metal=1.0, rough=0.34),
        "alu_dark": material("alu_anodized_graphite", 0.07, metal=1.0, rough=0.38),
        "steel": material("steel_fastener", 0.45, metal=1.0, rough=0.28),
        "chrome": material("chrome", 0.95, metal=1.0, rough=0.06),
        "rubber": material("rubber_black", 0.008, rough=0.7),
        "glass": material("glass_black", 0.004, rough=0.04, coat=1.0, coat_rough=0.02),
        "pcb": material("pcb_black", 0.025, rough=0.55),
        "chip": material("chip_mold", 0.012, rough=0.4),
        "emit": material("status_emitter", 0.9, rough=0.3, emit=(1.0, 1.0, 1.0), emit_strength=6.0),
        "lens": material("lens_coated", 0.02, metal=0.6, rough=0.05),
    }


# ---------------------------------------------------------------- mesh primitives

def _obj_from_bmesh(name, bm, mat=None, parent=None):
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    ob = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(ob)
    if mat is not None:
        me.materials.append(mat)
    if parent is not None:
        ob.parent = parent
    return ob


def box(name, size, loc=(0, 0, 0), mat=None, parent=None, bevel=0.0, segs=3):
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    bmesh.ops.scale(bm, vec=Vector(size), verts=bm.verts)
    ob = _obj_from_bmesh(name, bm, mat, parent)
    ob.location = loc
    if bevel > 0:
        add_bevel(ob, bevel, segs)
    return ob


def cylinder(name, r, depth, loc=(0, 0, 0), axis="Z", mat=None, parent=None,
             verts=48, bevel=0.0, segs=3, r2=None):
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=verts,
                          radius1=r, radius2=r if r2 is None else r2, depth=depth)
    rot = {"X": Matrix.Rotation(math.pi / 2, 4, "Y"),
           "Y": Matrix.Rotation(math.pi / 2, 4, "X"),
           "Z": Matrix.Identity(4)}[axis]
    bmesh.ops.transform(bm, matrix=rot, verts=bm.verts)
    ob = _obj_from_bmesh(name, bm, mat, parent)
    ob.location = loc
    if bevel > 0:
        add_bevel(ob, bevel, segs)
    smooth(ob)
    return ob


def lathe(name, profile, loc=(0, 0, 0), axis="Z", mat=None, parent=None, verts=64):
    """Revolve a (radius, height) polyline around the local Z, then orient."""
    bm = bmesh.new()
    prev = None
    edges_verts = []
    for r, h in profile:
        v = bm.verts.new((r, 0, h))
        edges_verts.append(v)
        if prev is not None:
            bm.edges.new((prev, v))
        prev = v
    bmesh.ops.spin(bm, geom=bm.verts[:] + bm.edges[:], cent=(0, 0, 0), axis=(0, 0, 1),
                   steps=verts, angle=math.tau, use_duplicate=False)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-6)
    rot = {"X": Matrix.Rotation(math.pi / 2, 4, "Y"),
           "Y": Matrix.Rotation(-math.pi / 2, 4, "X"),
           "Z": Matrix.Identity(4)}[axis]
    bmesh.ops.transform(bm, matrix=rot, verts=bm.verts)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    ob = _obj_from_bmesh(name, bm, mat, parent)
    ob.location = loc
    smooth(ob)
    return ob


def extrude_profile(name, pts, depth, loc=(0, 0, 0), plane="XZ", mat=None, parent=None,
                    bevel=0.0, segs=3):
    """Extrude a closed 2-D polygon symmetrically through its plane."""
    bm = bmesh.new()
    if plane == "XZ":
        vs = [bm.verts.new((x, -depth / 2, z)) for x, z in pts]
        normal_vec = (0, depth, 0)
    elif plane == "XY":
        vs = [bm.verts.new((x, y, -depth / 2)) for x, y in pts]
        normal_vec = (0, 0, depth)
    else:  # YZ
        vs = [bm.verts.new((-depth / 2, y, z)) for y, z in pts]
        normal_vec = (depth, 0, 0)
    face = bm.faces.new(vs)
    ret = bmesh.ops.extrude_face_region(bm, geom=[face])
    moved = [e for e in ret["geom"] if isinstance(e, bmesh.types.BMVert)]
    bmesh.ops.translate(bm, vec=normal_vec, verts=moved)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    ob = _obj_from_bmesh(name, bm, mat, parent)
    ob.location = loc
    if bevel > 0:
        add_bevel(ob, bevel, segs)
    return ob


def rounded_rect(w, h, r, n=6):
    """Closed 2-D rounded rectangle, centred."""
    pts = []
    for cx, cy, a0 in ((w / 2 - r, h / 2 - r, 0), (-w / 2 + r, h / 2 - r, 90),
                       (-w / 2 + r, -h / 2 + r, 180), (w / 2 - r, -h / 2 + r, 270)):
        for i in range(n + 1):
            a = math.radians(a0 + 90 * i / n)
            pts.append((cx + r * math.cos(a), cy + r * math.sin(a)))
    return pts


def empty(name, loc=(0, 0, 0), parent=None, size=0.02):
    ob = bpy.data.objects.new(name, None)
    ob.empty_display_size = size
    bpy.context.scene.collection.objects.link(ob)
    ob.location = loc
    if parent is not None:
        ob.parent = parent
    return ob


# ---------------------------------------------------------------- modifiers

def add_bevel(ob, width, segs=3, limit_angle=35):
    mod = ob.modifiers.new("bevel", "BEVEL")
    mod.width = width
    mod.segments = segs
    mod.limit_method = "ANGLE"
    mod.angle_limit = math.radians(limit_angle)
    mod.harden_normals = True
    mod.miter_outer = "MITER_ARC"
    wn = ob.modifiers.new("wnormal", "WEIGHTED_NORMAL")
    wn.keep_sharp = True
    smooth(ob)
    return mod


def smooth(ob, angle=32):
    me = ob.data
    for p in me.polygons:
        p.use_smooth = True
    if hasattr(me, "set_sharp_from_angle"):
        me.set_sharp_from_angle(angle=math.radians(angle))


def boolean_cut(ob, cutter, solver="EXACT"):
    mod = ob.modifiers.new("cut_" + cutter.name, "BOOLEAN")
    mod.operation = "DIFFERENCE"
    mod.object = cutter
    mod.solver = solver
    # Booleans must evaluate before the bevel so the cut edges get rounded.
    idx = list(ob.modifiers).index(mod)
    if idx:
        ob.modifiers.move(idx, 0)
    cutter.hide_render = True
    cutter.hide_viewport = True
    cutter["cutter"] = True
    return mod


def apply_all(objs):
    """Bake modifiers into mesh data (needed before export and for cutters)."""
    dg = bpy.context.evaluated_depsgraph_get()
    for ob in objs:
        if ob.type != "MESH" or not ob.modifiers:
            continue
        ev = ob.evaluated_get(dg)
        me = bpy.data.meshes.new_from_object(ev, preserve_all_data_layers=True, depsgraph=dg)
        old = ob.data
        ob.modifiers.clear()
        ob.data = me
        if old.users == 0:
            bpy.data.meshes.remove(old)


def delete_cutters():
    for ob in list(bpy.data.objects):
        if ob.get("cutter"):
            bpy.data.objects.remove(ob, do_unlink=True)


def mesh_tris(objs):
    dg = bpy.context.evaluated_depsgraph_get()
    total = 0
    for ob in objs:
        if ob.type != "MESH":
            continue
        me = ob.evaluated_get(dg).to_mesh()
        me.calc_loop_triangles()
        total += len(me.loop_triangles)
        ob.evaluated_get(dg).to_mesh_clear()
    return total


# ---------------------------------------------------------------- brand mark

# The supplied Loom mark (images/loom-mark.svg), as geometry: four woven bars
# split at their crossings, two ring terminals and six dot terminals. Units are
# the SVG's 4172 x 4092 viewBox; callers scale.
MARK_BARS = [((1250, 542), (1250, 1280)), ((1250, 1716), (1250, 3820)),
             ((2796, 508), (2796, 2829)), ((2796, 3266), (2796, 3580)),
             ((542, 1498), (2578, 1498)), ((3014, 1498), (3751, 1498)),
             ((271, 3047), (1032, 3047)), ((1468, 3047), (3521, 3047))]
MARK_BAR_W = 271
MARK_DOTS = [(542, 1498), (3751, 1498), (271, 3047), (2796, 508), (2796, 3580), (1250, 3820)]
MARK_DOT_R = 271
MARK_RINGS = [((1250, 339), 271, 135), ((3765, 3047), 325, 163)]


def mark_mesh(name, height_m, depth, mat, parent=None):
    """Build the logo as a thin relief in the local XY plane (Y up)."""
    s = height_m / 4092.0
    cx, cy = 4172 / 2, 4092 / 2
    bm = bmesh.new()

    def to_local(x, y):
        return ((x - cx) * s, (cy - y) * s)

    def add_poly(pts):
        vs = [bm.verts.new((x, y, 0)) for x, y in pts]
        f = bm.faces.new(vs)
        ret = bmesh.ops.extrude_face_region(bm, geom=[f])
        top = [e for e in ret["geom"] if isinstance(e, bmesh.types.BMVert)]
        bmesh.ops.translate(bm, vec=(0, 0, depth), verts=top)

    for (x0, y0), (x1, y1) in MARK_BARS:
        hw = MARK_BAR_W / 2
        if x0 == x1:
            quad = [(x0 - hw, y0), (x0 + hw, y0), (x0 + hw, y1), (x0 - hw, y1)]
        else:
            quad = [(x0, y0 - hw), (x1, y0 - hw), (x1, y0 + hw), (x0, y0 + hw)]
        add_poly([to_local(*p) for p in quad])
    for x, y in MARK_DOTS:
        add_poly([to_local(x + MARK_DOT_R * math.cos(a), y + MARK_DOT_R * math.sin(a))
                  for a in (i * math.tau / 32 for i in range(32))])
    for (x, y), r, w in MARK_RINGS:
        ro, ri = r + w / 2, r - w / 2
        n = 40
        for i in range(n):
            a0, a1 = i * math.tau / n, (i + 1) * math.tau / n
            add_poly([to_local(x + ro * math.cos(a0), y + ro * math.sin(a0)),
                      to_local(x + ro * math.cos(a1), y + ro * math.sin(a1)),
                      to_local(x + ri * math.cos(a1), y + ri * math.sin(a1)),
                      to_local(x + ri * math.cos(a0), y + ri * math.sin(a0))])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return _obj_from_bmesh(name, bm, mat, parent)


# ---------------------------------------------------------------- export

def export_glb(path, objs=None, extras=True):
    bpy.ops.object.select_all(action="DESELECT")
    if objs:
        for ob in objs:
            ob.select_set(True)
    bpy.ops.export_scene.gltf(
        filepath=path,
        export_format="GLB",
        use_selection=bool(objs),
        export_apply=True,
        export_extras=extras,
        export_yup=True,
        export_texcoords=True,
        export_normals=True,
        export_materials="EXPORT",
        export_cameras=False,
        export_lights=False,
        export_animations=False,
    )
