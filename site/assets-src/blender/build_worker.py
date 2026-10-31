"""Builds the Loom worker robot from nothing and exports it as glTF.

    blender -b -P build_worker.py -- <out.glb> [high|low]

This is an artistic interpretation of Worker V1: a differential-drive base
for coarse positioning, an articulated arm for fine placement, an RGB-D
camera, status lights and onboard compute. Proportions follow the
simulation model; surfaces and detailing are designed for the website.

Node contract (names the site drives; three.js frame after export: metres,
+X forward, +Y up, origin on the floor under the base):
  base, wheel_L, wheel_R, caster, camera, led_ring,
  arm_j1 (yaw), arm_link1 (shoulder pitch), arm_j2 (elbow pitch),
  arm_j3 (wrist pitch), arm_j4 (wrist roll), gripper, finger_L, finger_R,
  hotspot_* empties, and asm_* assembly groups carrying an `explode`
  extra: [dx, dy, dz] in three.js parent-local metres, plus `order`.
The arm is exported at rest (all joints zero, pointing straight up).
"""
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import lib  # noqa: E402
from mathutils import Matrix, Vector  # noqa: E402

argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
OUT = argv[0] if argv else os.path.join(os.getcwd(), "worker.glb")
LOD = argv[1] if len(argv) > 1 else "high"
HI = LOD == "high"
V = 64 if HI else 20          # radial segments
SEG = 3 if HI else 1          # bevel segments

lib.reset_scene()
M = lib.palette()


def three(dx, dy, dz):
    """Blender-frame vector -> three.js-frame list (for extras)."""
    return [dx, dz, -dy]


def assembly(name, parent, explode, order, label):
    g = lib.empty(name, parent=parent)
    g["explode"] = three(*explode)
    g["order"] = order
    g["label"] = label
    return g


root = lib.empty("worker")
base = lib.empty("base", parent=root)

# ------------------------------------------------------------------ chassis
chassis = assembly("asm_chassis", base, (0, 0, -0.03), 0, "chassis")
tray = lib.extrude_profile(
    "chassis_tray",
    [(-0.122, 0.020), (0.108, 0.020), (0.122, 0.034), (0.122, 0.069), (-0.122, 0.069)],
    0.184, mat=M["alu_dark"], parent=chassis, bevel=0.004, segs=SEG)
if HI:
    # Rear cooling slots, cut through the tray's back face.
    for i in range(7):
        c = lib.box(f"slot_cut_{i}", (0.02, 0.006, 0.026), loc=(-0.122, -0.054 + i * 0.018, 0.046))
        lib.boolean_cut(tray, c)
    # Underside skid plate
    lib.box("skid_plate", (0.17, 0.12, 0.003), loc=(0.0, 0, 0.0185), mat=M["alu"], parent=chassis,
            bevel=0.001, segs=1)

# ------------------------------------------------------------------ shell
shell_grp = assembly("asm_shell", base, (0, 0, 0.165), 6, "shell")
SHELL_PTS = [(-0.128, 0.05), (0.118, 0.05), (0.131, 0.066), (0.124, 0.094),
             (0.074, 0.109), (-0.112, 0.109), (-0.128, 0.098)]
shell = lib.extrude_profile("shell", SHELL_PTS, 0.192, mat=M["shell"], parent=shell_grp,
                            bevel=0.009 if HI else 0.006, segs=4 if HI else 2)
# Graphite front visor carrying the sensor window.
visor = lib.extrude_profile(
    "visor", [(0.1255, 0.072), (0.1325, 0.0745), (0.1268, 0.0905), (0.1195, 0.0928)],
    0.136, mat=M["glass"], parent=shell_grp, bevel=0.002, segs=SEG)
if HI:
    for sx, sy in ((0.095, 0.08), (0.095, -0.08), (-0.10, 0.08), (-0.10, -0.08)):
        z = 0.1092
        lib.cylinder(f"fastener_{sx}_{sy}", 0.0034, 0.0012, loc=(sx, sy, z + 0.0004),
                     mat=M["steel"], parent=shell_grp, verts=24, bevel=0.0004, segs=1)
    # The Loom mark, in graphite relief on both flanks.
    for side in (1, -1):
        mk = lib.mark_mesh(f"mark_{'L' if side > 0 else 'R'}", 0.024, 0.0006, M["shell_dark"],
                           parent=shell_grp)
        if side > 0:
            rot = Matrix(((-1, 0, 0), (0, 0, 1), (0, 1, 0)))
        else:
            rot = Matrix(((1, 0, 0), (0, 0, -1), (0, 1, 0)))
        mk.matrix_basis = Matrix.Translation((0.07, side * 0.0962, 0.08)) @ rot.to_4x4()
    # A parting line: a thin graphite band where the shell meets the tray.
    lib.extrude_profile("parting_band",
                        [(-0.124, 0.0495), (0.119, 0.0495), (0.127, 0.0545), (-0.124, 0.0545)],
                        0.1875, mat=M["shell_dark"], parent=shell_grp, bevel=0.001, segs=1)

# ------------------------------------------------------------------ drive
WHEEL_R, WHEEL_W, WHEEL_X, WHEEL_Y = 0.046, 0.026, -0.022, 0.1185
TYRE = [(0.0285, -0.0135), (0.0405, -0.0135), (0.0448, -0.0112), (0.046, -0.0072),
        (0.046, -0.0046), (0.0447, -0.0040), (0.0447, -0.0026), (0.046, -0.0020),
        (0.046, 0.0020), (0.0447, 0.0026), (0.0447, 0.0040), (0.046, 0.0046),
        (0.046, 0.0072), (0.0448, 0.0112), (0.0405, 0.0135), (0.0285, 0.0135),
        (0.0285, -0.0135)]
for side, tag in ((1, "L"), (-1, "R")):
    drive = assembly(f"asm_drive_{tag}", base, (0, side * 0.135, 0), 1, "drive")
    wheel = lib.empty(f"wheel_{tag}", loc=(WHEEL_X, side * WHEEL_Y, WHEEL_R), parent=drive)
    lib.lathe(f"tyre_{tag}", TYRE, axis="Y", mat=M["rubber"], parent=wheel, verts=V)
    hub = lib.cylinder(f"hub_{tag}", 0.0292, 0.021, axis="Y", mat=M["alu"], parent=wheel,
                       verts=V, bevel=0.0018, segs=SEG)
    if HI:
        for k in range(6):
            a = k * math.tau / 6
            c = lib.cylinder(f"hub_hole_{tag}_{k}", 0.0064, 0.04, axis="Y",
                             loc=(0.0178 * math.cos(a), 0, 0.0178 * math.sin(a)), verts=24)
            c.parent = wheel
            lib.boolean_cut(hub, c)
        lib.cylinder(f"hub_inner_{tag}", 0.027, 0.006, axis="Y", loc=(0, -side * 0.006, 0),
                     mat=M["alu_dark"], parent=wheel, verts=V)
    lib.cylinder(f"hub_cap_{tag}", 0.0085, 0.0232, axis="Y", mat=M["chrome"], parent=wheel,
                 verts=32, bevel=0.0015, segs=SEG)
    if HI:
        # Gearmotor tucked inside the chassis; only seen exploded.
        motor = lib.empty(f"motor_{tag}", loc=(WHEEL_X, side * 0.074, WHEEL_R), parent=drive)
        lib.cylinder(f"motor_can_{tag}", 0.0125, 0.034, axis="Y", loc=(0, -side * 0.012, 0),
                     mat=M["alu"], parent=motor, verts=40, bevel=0.0012, segs=2)
        lib.box(f"gearbox_{tag}", (0.03, 0.022, 0.03), loc=(0, side * 0.016, 0),
                mat=M["alu_dark"], parent=motor, bevel=0.002, segs=2)
        lib.cylinder(f"motor_endcap_{tag}", 0.0105, 0.004, axis="Y", loc=(0, -side * 0.031, 0),
                     mat=M["shell_dark"], parent=motor, verts=32)

for tag, x in (("caster", 0.094), ("caster_rear", -0.104)):
    cg = assembly(f"asm_{tag}", base, (0, 0, -0.06), 1, "caster")
    c = lib.empty(tag, loc=(x, 0, 0.0115), parent=cg)
    lib.cylinder(f"{tag}_housing", 0.0145, 0.011, loc=(0, 0, 0.0095), mat=M["alu_dark"],
                 parent=c, verts=32, bevel=0.0015, segs=SEG)
    ball = lib.empty(f"{tag}_ball_n", parent=c)
    import bmesh  # noqa: E402
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=32 if HI else 12, v_segments=16 if HI else 8,
                              radius=0.0112)
    sph = lib._obj_from_bmesh(f"{tag}_ball", bm, M["chrome"], ball)
    lib.smooth(sph, 80)

# ------------------------------------------------------------------ power
if HI:
    power = assembly("asm_power", base, (0, 0, 0.055), 3, "power")
    lib.box("battery", (0.15, 0.078, 0.03), loc=(-0.012, 0, 0.038), mat=M["shell_dark"],
            parent=power, bevel=0.004, segs=SEG)
    lib.box("battery_band", (0.0605, 0.0785, 0.0305), loc=(-0.03, 0, 0.038), mat=M["alu"],
            parent=power, bevel=0.003, segs=SEG)
    lib.box("battery_lead", (0.012, 0.016, 0.01), loc=(0.067, 0.02, 0.046), mat=M["chip"],
            parent=power, bevel=0.0015, segs=1)

# ------------------------------------------------------------------ compute
if HI:
    compute = assembly("asm_compute", base, (0, 0, 0.105), 4, "compute")
    lib.box("pcb", (0.098, 0.074, 0.0016), loc=(0.005, 0, 0.0585), mat=M["pcb"], parent=compute,
            bevel=0.0006, segs=1)
    # Processor module under a finned heatsink; MCU, memory and connectors around it.
    lib.box("som", (0.044, 0.04, 0.003), loc=(0.004, 0, 0.0608), mat=M["chip"], parent=compute,
            bevel=0.0006, segs=1)
    lib.box("heatsink_base", (0.046, 0.042, 0.003), loc=(0.004, 0, 0.0638), mat=M["alu"],
            parent=compute, bevel=0.0006, segs=1)
    for i in range(9):
        lib.box(f"fin_{i}", (0.046, 0.0016, 0.014), loc=(0.004, -0.019 + i * 0.00475, 0.0722),
                mat=M["alu"], parent=compute, bevel=0.0005, segs=1)
    for i, (x, y, sx, sy) in enumerate(((0.043, 0.022, 0.009, 0.009), (0.043, -0.021, 0.012, 0.007),
                                        (-0.034, 0.024, 0.014, 0.01), (-0.034, -0.02, 0.01, 0.014),
                                        (0.032, 0.0, 0.006, 0.006))):
        lib.box(f"ic_{i}", (sx, sy, 0.0016), loc=(x, y, 0.0602), mat=M["chip"], parent=compute,
                bevel=0.0003, segs=1)
    lib.box("conn_usb", (0.008, 0.012, 0.005), loc=(0.052, 0.0, 0.0618), mat=M["steel"],
            parent=compute, bevel=0.0006, segs=1)
    lib.box("conn_header", (0.05, 0.005, 0.0045), loc=(-0.01, 0.0335, 0.0615), mat=M["chip"],
            parent=compute, bevel=0.0005, segs=1)

# ------------------------------------------------------------------ status lights
status = assembly("asm_status", base, (0, 0, 0.205), 7, "status")
ring = lib.empty("led_ring", loc=(-0.042, 0, 0.1092), parent=status)
lib.lathe("ring_emitter", [(0.0365, 0.0), (0.0455, 0.0), (0.0455, 0.0034), (0.0365, 0.0034),
                           (0.0365, 0.0)], mat=M["emit"], parent=ring, verts=V)
lib.lathe("ring_bezel", [(0.0455, 0.0), (0.0488, 0.0), (0.0488, 0.0042), (0.0455, 0.0042),
                         (0.0455, 0.0)], mat=M["alu"], parent=ring, verts=V)

# ------------------------------------------------------------------ camera
cam_grp = assembly("asm_camera", base, (0.12, 0, 0.05), 5, "camera")
lib.box("mast", (0.012, 0.016, 0.05), loc=(0.088, 0, 0.128), mat=M["alu"], parent=cam_grp,
        bevel=0.0025, segs=SEG)
camera = lib.empty("camera", loc=(0.093, 0, 0.162), parent=cam_grp)
camera.rotation_euler = (0, math.radians(14), 0)
lib.box("cam_body", (0.026, 0.098, 0.027), mat=M["alu"], parent=camera, bevel=0.006, segs=SEG)
lib.box("cam_face", (0.004, 0.09, 0.019), loc=(0.0118, 0, 0), mat=M["glass"], parent=camera,
        bevel=0.0018, segs=SEG)
for i, y in enumerate((0.033, -0.033)):
    lib.cylinder(f"cam_lens_{i}", 0.0062, 0.003, axis="X", loc=(0.0136, y, 0), mat=M["lens"],
                 parent=camera, verts=32 if HI else 12, bevel=0.0006, segs=1)
    lib.cylinder(f"cam_bezel_{i}", 0.0074, 0.0016, axis="X", loc=(0.0131, y, 0), mat=M["chrome"],
                 parent=camera, verts=32 if HI else 12)
lib.box("cam_projector", (0.002, 0.012, 0.007), loc=(0.0136, 0.008, 0), mat=M["lens"],
        parent=camera, bevel=0.0006, segs=1)
lib.cylinder("cam_rgb", 0.0034, 0.002, axis="X", loc=(0.0137, -0.012, 0), mat=M["lens"],
             parent=camera, verts=24 if HI else 10)

# ------------------------------------------------------------------ arm
TURRET = (-0.042, 0.0, 0.1092)
L_UPPER, L_FORE = 0.128, 0.112
arm_grp = assembly("asm_arm", base, (-0.01, 0, 0.25), 8, "arm")
j1 = lib.empty("arm_j1", loc=TURRET, parent=arm_grp)
lib.cylinder("turret_base", 0.0335, 0.012, loc=(0, 0, 0.006), mat=M["alu_dark"], parent=j1,
             verts=V, bevel=0.002, segs=SEG)
lib.cylinder("turret", 0.03, 0.03, loc=(0, 0, 0.026), mat=M["shell"], parent=j1, verts=V,
             bevel=0.004, segs=SEG)
lib.cylinder("turret_cap", 0.0305, 0.0035, loc=(0, 0, 0.0128), mat=M["shell_dark"], parent=j1,
             verts=V)


def joint_housing(name, r, w, parent, loc=(0, 0, 0)):
    g = lib.empty(name + "_housing", loc=loc, parent=parent)
    lib.cylinder(name + "_drum", r, w, axis="Y", mat=M["alu"], parent=g, verts=V,
                 bevel=0.0025, segs=SEG)
    lib.cylinder(name + "_seam", r * 1.01, w * 0.18, axis="Y", mat=M["shell_dark"], parent=g,
                 verts=V)
    for s in (1, -1):
        lib.cylinder(f"{name}_cap_{s}", r * 0.52, 0.0024, axis="Y", loc=(0, s * w / 2, 0),
                     mat=M["alu_dark"], parent=g, verts=40 if HI else 12, bevel=0.0006, segs=1)
    return g


def link(name, length, w, d, r, parent, z0=0.0):
    """A tapered polymer link running up local +Z from z0."""
    ob = lib.extrude_profile(name, lib.rounded_rect(d, w, r), length, plane="XY",
                             mat=M["shell"], parent=parent, bevel=0.003, segs=SEG)
    ob.location = (0, 0, z0 + length / 2)
    return ob


shoulder = lib.empty("arm_link1", loc=(0, 0, 0.052), parent=j1)
joint_housing("shoulder", 0.025, 0.05, shoulder)
link("upper_arm", L_UPPER - 0.03, 0.036, 0.03, 0.009, shoulder, z0=0.015)
if HI:
    for s_ in (1, -1):
        lib.box(f"upper_arm_stripe_{s_}", (0.012, 0.0012, 0.07), loc=(0, s_ * 0.0181, 0.07),
                mat=M["shell_dark"], parent=shoulder, bevel=0.0004, segs=1)

elbow = lib.empty("arm_j2", loc=(0, 0, L_UPPER), parent=shoulder)
joint_housing("elbow", 0.021, 0.044, elbow)
link("forearm", L_FORE - 0.026, 0.03, 0.026, 0.008, elbow, z0=0.013)

wrist = lib.empty("arm_j3", loc=(0, 0, L_FORE), parent=elbow)
joint_housing("wrist", 0.017, 0.036, wrist)

roll = lib.empty("arm_j4", loc=(0, 0, 0.024), parent=wrist)
lib.cylinder("wrist_roll", 0.0155, 0.02, loc=(0, 0, 0.002), mat=M["alu_dark"], parent=roll,
             verts=V, bevel=0.002, segs=SEG)

# ------------------------------------------------------------------ gripper
grip_grp = assembly("asm_gripper", roll, (0, 0.06, 0), 9, "gripper")
gripper = lib.empty("gripper", loc=(0, 0, 0.014), parent=grip_grp)
lib.box("palm", (0.026, 0.05, 0.02), loc=(0, 0, 0.01), mat=M["alu"], parent=gripper,
        bevel=0.004, segs=SEG)
lib.box("palm_rail", (0.008, 0.046, 0.004), loc=(0, 0, 0.021), mat=M["alu_dark"],
        parent=gripper, bevel=0.0008, segs=1)
for side, tag in ((1, "L"), (-1, "R")):
    f = lib.empty(f"finger_{tag}", loc=(0, side * 0.013, 0.022), parent=gripper)
    lib.box(f"finger_plate_{tag}", (0.018, 0.006, 0.042), loc=(0, side * 0.002, 0.021),
            mat=M["alu"], parent=f, bevel=0.0018, segs=SEG)
    lib.box(f"finger_pad_{tag}", (0.0145, 0.0024, 0.026), loc=(0, -side * 0.0018, 0.027),
            mat=M["rubber"], parent=f, bevel=0.0008, segs=1)

# ------------------------------------------------------------------ hotspots
HOTSPOTS = {
    "hotspot_camera": (cam_grp, (0.112, 0, 0.168)),
    "hotspot_drive": (base, (WHEEL_X, WHEEL_Y + 0.016, WHEEL_R)),
    "hotspot_compute": (base, (0.01, 0, 0.11)),
    "hotspot_ring": (status, (-0.042, 0.046, 0.111)),
    "hotspot_power": (base, (-0.06, 0.0, 0.07)),
    "hotspot_arm": (elbow, (0, 0.024, 0)),
    "hotspot_gripper": (gripper, (0, 0, 0.05)),
}
for name, (parent, loc) in HOTSPOTS.items():
    lib.empty(name, loc=loc, parent=parent)

lib.apply_all([o for o in __import__("bpy").data.objects if o.type == "MESH"])
lib.delete_cutters()
meshes = [o for o in __import__("bpy").data.objects if o.type == "MESH"]
print(f"WORKER lod={LOD} meshes={len(meshes)} tris={lib.mesh_tris(meshes)}")
lib.export_glb(OUT)
print("WROTE", OUT)
