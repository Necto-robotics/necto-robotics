"""Builds the assembly hall, bakes its daylight into a lightmap, exports GLB.

    blender -b -P build_hall.py -- <out.glb> [bake_px] [samples]

A minimalist concrete hall: polished floor, a white assembly plinth where
the robots build, deep ceiling beams with skylight slots that throw long
shafts across the floor, a colonnade along both sides and a tall glazed
end wall. The static architecture is joined into one mesh and baked (diffuse
direct + indirect, albedo included) into a single atlas, so the browser
shows real global illumination for the cost of one texture. Glossy light is
left out of the bake; the site adds floor reflection and robot lighting in
real time.

Layout (Blender frame; three.js after export: x same, y up, z = -y):
  plinth top at z = PLINTH_H, centred on the origin, 3.2 x 2.2 m.
  Extras on the root: plinth_h, lightmap_scale (multiply the texture by
  this to recover scene radiance), sun_dir (three.js frame, toward the sun).
"""
import math
import os
import sys

import bpy
from mathutils import Vector

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import lib  # noqa: E402

argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
OUT = argv[0] if argv else os.path.join(os.getcwd(), "hall.glb")
BAKE_PX = int(argv[1]) if len(argv) > 1 else 4096
SAMPLES = int(argv[2]) if len(argv) > 2 else 384

lib.reset_scene()
sc = bpy.context.scene

W, D, H = 16.0, 11.0, 5.2          # interior: x length, y depth, height
PLINTH = (3.4, 2.4)
PLINTH_H = 0.14
LM_SCALE = 3.0                     # radiance stored as value / LM_SCALE

concrete = lib.material("concrete_floor", 0.2, rough=0.55)
wall = lib.material("concrete_wall", 0.56, rough=0.8)
ceiling = lib.material("ceiling", 0.78, rough=0.85)
plinth_m = lib.material("plinth", 0.52, rough=0.45)
column_m = lib.material("column", 0.62, rough=0.75)
frame_m = lib.material("glazing_frame", 0.12, rough=0.5)

static = []


def keep(ob):
    static.append(ob)
    return ob


# ---------------------------------------------------------------- shell
keep(lib.box("floor", (W + 2, D + 2, 0.2), loc=(0, 0, -0.1), mat=concrete))
keep(lib.box("plinth", (PLINTH[0], PLINTH[1], PLINTH_H), loc=(0, 0, PLINTH_H / 2), mat=plinth_m,
             bevel=0.012, segs=3))
# A thin shadow gap under the plinth so it reads as floating stone.
keep(lib.box("plinth_reveal", (PLINTH[0] - 0.08, PLINTH[1] - 0.08, 0.03), loc=(0, 0, 0.015),
             mat=frame_m))

keep(lib.box("wall_back", (W + 2, 0.4, H + 1.2), loc=(0, D / 2 + 0.2, H / 2), mat=wall))
keep(lib.box("wall_front", (W + 2, 0.4, H + 1.2), loc=(0, -D / 2 - 0.2, H / 2), mat=wall))

# Right end wall (+X): a tall glazed screen of vertical mullions; daylight
# enters between them from the sky.
for i in range(12):
    y = -D / 2 + 0.5 + i * (D - 1.0) / 11
    keep(lib.box(f"mullion_{i}", (0.14, 0.09, H), loc=(W / 2 + 0.05, y, H / 2), mat=frame_m))
keep(lib.box("glazing_head", (0.4, D + 0.8, 0.6), loc=(W / 2 + 0.1, 0, H + 0.0), mat=wall))
keep(lib.box("glazing_sill", (0.4, D + 0.8, 0.12), loc=(W / 2 + 0.1, 0, 0.06), mat=frame_m))

# Bright sky panel beyond the glazing: seen between the mullions and the
# main fill light through them.
sky_m = lib.material("sky_panel", 1.0, rough=1.0, emit=(1.0, 1.0, 1.0), emit_strength=2.2)
keep(lib.box("sky_panel", (0.1, D + 4, H + 3), loc=(W / 2 + 1.6, 0, H / 2), mat=sky_m))

# Left end wall (-X): solid, with a deep recessed panel.
keep(lib.box("wall_left", (0.4, D + 0.8, H + 1.2), loc=(-W / 2 - 0.2, 0, H / 2), mat=wall))
keep(lib.box("wall_left_recess", (0.06, D * 0.55, H * 0.62), loc=(-W / 2 + 0.03, 0, H * 0.42),
             mat=column_m))

# Ceiling: deep beams running along Y with skylight slots between them.
SLOTS = 6
beam_w = W / SLOTS * 0.62
for i in range(SLOTS + 1):
    x = -W / 2 + i * W / SLOTS
    keep(lib.box(f"beam_{i}", (beam_w, D + 0.8, 0.9), loc=(x, 0, H + 0.45), mat=ceiling))
keep(lib.box("roof", (W + 2, D + 2, 0.2), loc=(0, 0, H + 1.8), mat=ceiling))
# Upstands so each slot is a light well, not an open roof.
for i in range(SLOTS):
    x = -W / 2 + (i + 0.5) * W / SLOTS
    for s in (1, -1):
        keep(lib.box(f"well_{i}_{s}", (W / SLOTS - beam_w, 0.2, 0.8),
                     loc=(x, s * (D / 2 + 0.3), H + 1.3), mat=ceiling))

# Colonnade along both long walls.
for side in (1, -1):
    for i in range(7):
        x = -W / 2 + 1.6 + i * (W - 3.2) / 6
        keep(lib.box(f"col_{side}_{i}", (0.42, 0.42, H), loc=(x, side * (D / 2 - 1.05), H / 2),
                     mat=column_m, bevel=0.01, segs=2))

# Remove the roof above the slots by cutting light wells through it.
roof = [o for o in static if o.name == "roof"][0]
for i in range(SLOTS):
    x = -W / 2 + (i + 0.5) * W / SLOTS
    c = lib.box(f"skylight_cut_{i}", (W / SLOTS - beam_w + 0.02, D + 0.4, 1.0), loc=(x, 0, H + 1.8))
    lib.boolean_cut(roof, c)

lib.apply_all(static)
lib.delete_cutters()

# ---------------------------------------------------------------- lighting
world = bpy.data.worlds.new("sky")
sc.world = world
world.use_nodes = True
bg = world.node_tree.nodes["Background"]
bg.inputs[0].default_value = (0.82, 0.84, 0.86, 1)
bg.inputs[1].default_value = 0.8

sun_data = bpy.data.lights.new("sun", "SUN")
sun_data.energy = 6.5
sun_data.angle = math.radians(1.2)
sun = bpy.data.objects.new("sun", sun_data)
sc.collection.objects.link(sun)
SUN_EL, SUN_AZ = math.radians(58), math.radians(-72)
to_sun = Vector((math.cos(SUN_EL) * math.cos(SUN_AZ), math.cos(SUN_EL) * math.sin(SUN_AZ),
                 math.sin(SUN_EL)))
sun.rotation_euler = (-to_sun).to_track_quat("-Z", "Y").to_euler()

# ---------------------------------------------------------------- bake
bpy.ops.object.select_all(action="DESELECT")
for o in static:
    o.select_set(True)
bpy.context.view_layer.objects.active = static[0]
bpy.ops.object.join()
hall = bpy.context.view_layer.objects.active
hall.name = "hall"

# Cull faces no camera can see (outer skins, undersides, roof top) so the
# atlas spends its texels on the interior.
import bmesh  # noqa: E402
bm = bmesh.new()
bm.from_mesh(hall.data)
lo = Vector((-W / 2 - 0.03, -D / 2 - 0.03, -0.005))
hi = Vector((W / 2 + 1.7, D / 2 + 2.1, H + 1.71))
dead = [f for f in bm.faces if not all(lo[k] <= f.calc_center_median()[k] <= hi[k] for k in range(3))]
bmesh.ops.delete(bm, geom=dead, context="FACES")
bm.to_mesh(hall.data)
bm.free()

bpy.ops.object.mode_set(mode="EDIT")
bpy.ops.mesh.select_all(action="SELECT")
bpy.ops.uv.smart_project(angle_limit=math.radians(60), island_margin=0.0015,
                         area_weight=1.0, scale_to_bounds=False)
bpy.ops.uv.pack_islands(rotate=True, margin=0.0015)
bpy.ops.object.mode_set(mode="OBJECT")

img = bpy.data.images.new("hall_lightmap", BAKE_PX, BAKE_PX, alpha=False, float_buffer=True)
for i, m in enumerate(hall.data.materials):
    if m is None:
        hall.data.materials[i] = wall
for m in set(hall.data.materials):
    nt = m.node_tree
    node = nt.nodes.new("ShaderNodeTexImage")
    node.image = img
    nt.nodes.active = node

sc.render.engine = "CYCLES"
prefs = bpy.context.preferences.addons["cycles"].preferences
for kind in ("OPTIX", "CUDA"):
    try:
        prefs.compute_device_type = kind
        prefs.get_devices()
        for d in prefs.devices:
            d.use = True
        sc.cycles.device = "GPU"
        break
    except Exception:
        continue
sc.cycles.samples = SAMPLES
sc.cycles.max_bounces = 6
sc.cycles.diffuse_bounces = 4
bake = sc.render.bake
bake.use_pass_direct = True
bake.use_pass_indirect = True
bake.use_pass_color = True
bake.use_pass_glossy = False
bake.use_pass_transmission = False
bake.use_pass_emit = True
bake.use_pass_diffuse = True
bake.margin = 6
print("BAKING", BAKE_PX, SAMPLES)
bpy.ops.object.bake(type="COMBINED", pass_filter={"DIRECT", "INDIRECT", "COLOR", "DIFFUSE", "EMIT"})

# Denoise the bake through the compositor-free path: a light 3x3 box blur in
# numpy would soften the shafts, so rely on samples instead and just scale.
import numpy as np  # noqa: E402

px = np.empty(BAKE_PX * BAKE_PX * 4, dtype=np.float32)
img.pixels.foreach_get(px)
px = px.reshape(-1, 4)
px[:, :3] = np.clip(px[:, :3] / LM_SCALE, 0, 1)
px[:, :3] = np.where(px[:, :3] <= 0.0031308, px[:, :3] * 12.92,
                     1.055 * np.power(px[:, :3], 1 / 2.4) - 0.055)  # linear -> sRGB
out_img = bpy.data.images.new("hall_lightmap_srgb", BAKE_PX, BAKE_PX, alpha=False)
out_img.colorspace_settings.name = "sRGB"
px[:, 3] = 1.0
out_img.pixels.foreach_set(px.ravel())
png = os.path.splitext(OUT)[0] + "_lightmap.png"
out_img.filepath_raw = png
out_img.file_format = "PNG"
out_img.save()
print("WROTE", png)

# Export geometry with a plain material that references the baked atlas.
m = bpy.data.materials.new("hall_baked")
m.use_nodes = True
nt = m.node_tree
tex = nt.nodes.new("ShaderNodeTexImage")
tex.image = out_img
nt.links.new(tex.outputs["Color"], nt.nodes["Principled BSDF"].inputs["Base Color"])
hall.data.materials.clear()
hall.data.materials.append(m)

root = lib.empty("hall_root")
hall.parent = root
root["plinth_h"] = PLINTH_H
root["lightmap_scale"] = LM_SCALE
root["sun_dir"] = [to_sun.x, to_sun.z, -to_sun.y]
root["interior"] = [W, H, D]

bpy.ops.object.select_all(action="DESELECT")
bpy.ops.export_scene.gltf(filepath=OUT, export_format="GLB", export_apply=True, export_extras=True,
                          export_yup=True, export_image_format="WEBP", export_image_quality=88,
                          export_materials="EXPORT", export_cameras=False, export_lights=False)
print("WROTE", OUT, "tris", lib.mesh_tris([hall]))
