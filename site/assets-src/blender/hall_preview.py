"""Preview the baked hall as the browser will show it (texture as emission)."""
import math, os, sys
import bpy
from mathutils import Vector
argv = sys.argv[sys.argv.index("--") + 1:]
GLB, OUT = argv[0], argv[1]
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=GLB)
sc = bpy.context.scene
root = [o for o in sc.objects if o.get("lightmap_scale")][0]
scale = root["lightmap_scale"]
for m in bpy.data.materials:
    nt = m.node_tree
    tex = [n for n in nt.nodes if n.type == "TEX_IMAGE"][0]
    out = [n for n in nt.nodes if n.type == "OUTPUT_MATERIAL"][0]
    em = nt.nodes.new("ShaderNodeEmission")
    em.inputs[1].default_value = scale
    nt.links.new(tex.outputs[0], em.inputs[0])
    nt.links.new(em.outputs[0], out.inputs[0])
sc.render.engine = "BLENDER_EEVEE"
sc.view_settings.view_transform = "AgX"
sc.render.resolution_x, sc.render.resolution_y = 1600, 900
cam = bpy.data.objects.new("cam", bpy.data.cameras.new("cam")); sc.collection.objects.link(cam); sc.camera = cam
for i, (loc, tgt, lens) in enumerate((((0, -5.0, 1.35), (0.3, 1.5, 0.9), 26), ((-4.5, -3.8, 0.6), (0.0, 0.0, 0.35), 32), ((2.2, -2.0, 0.55), (0, 0, 0.2), 40))):
    cam.location = loc; cam.data.lens = lens
    cam.rotation_euler = (Vector(tgt) - Vector(loc)).to_track_quat("-Z", "Y").to_euler()
    sc.render.filepath = os.path.join(OUT, f"view{i}.png")
    bpy.ops.render.render(write_still=True)
