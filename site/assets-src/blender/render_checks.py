"""Review renders for a scripted asset (design QA, not shipped).

    blender -b -P render_checks.py -- <worker.glb> <out_dir> [samples]

Imports the exported GLB (so the export itself is what gets reviewed), poses
the arm, and renders hero, three-quarter rear, top and exploded views under a
light showroom setup and a dark studio setup with Cycles.
"""
import math
import os
import sys

import bpy
from mathutils import Vector

argv = sys.argv[sys.argv.index("--") + 1:]
GLB, OUT = argv[0], argv[1]
SAMPLES = int(argv[2]) if len(argv) > 2 else 96
os.makedirs(OUT, exist_ok=True)

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=GLB)
sc = bpy.context.scene
ob = {o.name: o for o in sc.objects}

POSE = {"arm_j1": ("Z", 0), "arm_link1": ("Y", -22), "arm_j2": ("Y", 128),
        "arm_j3": ("Y", 62), "arm_j4": ("Z", 0)}


def pose(p):
    for name, (axis, deg) in p.items():
        o = ob.get(name)
        if not o:
            continue
        o.rotation_mode = "XYZ"
        o.rotation_euler = (0, 0, 0)
        idx = "XYZ".index(axis)
        e = list(o.rotation_euler)
        e[idx] = math.radians(deg)
        o.rotation_euler = e


def explode(k):
    for o in sc.objects:
        ex = o.get("explode")
        if ex is None:
            continue
        rest = o.get("_rest")
        if rest is None:
            o["_rest"] = list(o.location)
            rest = o["_rest"]
        # extras are three.js frame: (x, y_up, z) -> blender (x, -z, y)
        d = Vector((ex[0], -ex[2], ex[1]))
        o.location = Vector(rest) + d * k


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
sc.cycles.use_denoising = True
sc.render.resolution_x, sc.render.resolution_y = 1600, 1000
sc.view_settings.view_transform = "AgX"
sc.view_settings.look = "AgX - Base Contrast"

world = bpy.data.worlds.new("w")
sc.world = world
world.use_nodes = True
bg = world.node_tree.nodes["Background"]

floor_me = bpy.data.meshes.new("floor")
floor_me.from_pydata([(-5, -5, 0), (5, -5, 0), (5, 5, 0), (-5, 5, 0)], [], [(0, 1, 2, 3)])
floor = bpy.data.objects.new("floor", floor_me)
sc.collection.objects.link(floor)
fmat = bpy.data.materials.new("floor")
fmat.use_nodes = True
fb = fmat.node_tree.nodes["Principled BSDF"]
floor_me.materials.append(fmat)


def area(name, loc, size, energy, target=(0, 0, 0.12)):
    L = bpy.data.lights.new(name, "AREA")
    L.size = size
    L.energy = energy
    o = bpy.data.objects.new(name, L)
    sc.collection.objects.link(o)
    o.location = loc
    d = Vector(target) - Vector(loc)
    o.rotation_euler = d.to_track_quat("-Z", "Y").to_euler()
    return o


lights = []


def setup(mode):
    for L in lights:
        bpy.data.objects.remove(L, do_unlink=True)
    lights.clear()
    if mode == "light":
        bg.inputs[0].default_value = (0.86, 0.86, 0.87, 1)
        bg.inputs[1].default_value = 0.9
        fb.inputs["Base Color"].default_value = (0.72, 0.72, 0.72, 1)
        fb.inputs["Roughness"].default_value = 0.42
        lights.append(area("sky", (-0.6, 0.9, 2.2), 2.4, 260))
        lights.append(area("fill", (1.2, -0.8, 0.6), 1.2, 40))
    else:
        bg.inputs[0].default_value = (0.0, 0.0, 0.0, 1)
        bg.inputs[1].default_value = 0.0
        fb.inputs["Base Color"].default_value = (0.02, 0.02, 0.02, 1)
        fb.inputs["Roughness"].default_value = 0.25
        lights.append(area("key", (0.7, -0.9, 0.9), 0.7, 60))
        lights.append(area("rim", (-0.8, 0.7, 0.6), 0.25, 70))
        lights.append(area("top", (0, 0, 1.4), 0.9, 18))


cam = bpy.data.objects.new("cam", bpy.data.cameras.new("cam"))
sc.collection.objects.link(cam)
sc.camera = cam
cam.data.lens = 70


def shoot(name, az, el, dist, target=(0.0, 0.0, 0.14)):
    t = Vector(target)
    a, e = math.radians(az), math.radians(el)
    cam.location = t + Vector((math.cos(a) * math.cos(e), math.sin(a) * math.cos(e), math.sin(e))) * dist
    cam.rotation_euler = (t - cam.location).to_track_quat("-Z", "Y").to_euler()
    sc.render.filepath = os.path.join(OUT, name + ".png")
    bpy.ops.render.render(write_still=True)


pose(POSE)
setup("light")
shoot("light_hero", -38, 16, 1.25)
shoot("light_rear", 145, 22, 1.25)
setup("dark")
shoot("dark_hero", -30, 10, 1.15)
shoot("dark_side", -90, 4, 1.2)
explode(1.0)
shoot("dark_exploded", -35, 18, 1.75, target=(0.0, 0.0, 0.22))
