"""
The editor stage's desks, built from primitives as low-poly glTF for `editor/src/lib/stage/mock-stage.ts` (the Stage
panel's *desk* choice): a table on Egon Eiermann's steel tube frame (Tischgestell 1, 1953) with a screen-printed
plywood top, and Philipp Camille Schöpfer's white desk – a thick white top with three drawer cutouts in its front
edge on four slender white steel legs splayed outward.

    "C:/Program Files/Blender Foundation/Blender 5.1/blender.exe" -b -P editor/tools/desk-eiermann.py [-- out-dir]

Writes `desk-eiermann.glb` and `desk-schoepfer.glb` into `editor/static/models/` (next to this script's folder) unless
another folder follows `--`.

The Eiermann frame's measurements (mm) come from a 3ds Max model of the frame Tilman supplied
(`01_E1_1100x660-exzentrisch`, not in the repository, 17 000 triangles): round tube Ø 20, four vertical legs with the
thinner Ø 17 inner tube of the height adjustment showing under the top, an upper and a lower cross tube per end
frame, and two diagonal struts that cross between the ends – from the back of one lower cross tube to the front of
the other's upper one, placed off the middle ("exzentrisch"). The clamps and screws of the original are left out.
Schöpfer's desk is modelled after a photograph. Every tube has eight segments, no caps where none shows, and no
bevels: a few hundred triangles a desk.

Units: the scene is built in millimetres, Z up, and exported in metres, Y up (glTF). The origin is the centre of the
top's upper surface, so the stage sets the table's height directly. Materials by name – the stage assigns its own
look to `top` (the plywood faces, UV 0..1 over the top, or Schöpfer's white) and `edge` (the Eiermann top's cut
edges, the plies along the edge); `steel` (the frame) and `drawer` (the inside of Schöpfer's cutouts) stay as
exported.
"""

import os
import sys
import math

import bpy
import bmesh
from mathutils import Matrix, Vector

# ── Both tables (mm) ──────────────────────────────────────────────────────────────────────────────────────────────
TOP_WIDTH, TOP_DEPTH = 1400.0, 1000.0                        # the stage's table
HEIGHT = 720.0                                               # floor to the top's surface
FLOOR = -HEIGHT
SEGMENTS = 8

# ── The Eiermann table ────────────────────────────────────────────────────────────────────────────────────────────
E_TOP_THICKNESS = 18.0                                       # a Siebdruckplatte
E_TUBE_RADIUS = 10.0                                         # Ø 20 round steel tube
E_INNER_RADIUS = 8.5                                         # the height adjustment's inner tube, Ø 17
E_LEG_X, E_LEG_Y = 540.0, 320.0                              # the legs' axes: the frame is 1080 × 640
E_UNDERSIDE = -E_TOP_THICKNESS
E_UPPER_BAR = E_UNDERSIDE - 112.0                            # the upper cross tube's axis under the top
E_LOWER_BAR = FLOOR + 140.0                                  # the lower cross tube's axis above the floor
E_LEG_TOP = E_UNDERSIDE - 55.0                               # the outer leg ends here, the inner tube shows above
E_STRUT_LOWER_Y, E_STRUT_UPPER_Y = 254.0, -144.0             # where the struts meet the lower and the upper tubes
E_EDGE_REPEAT_MM = 500.0                                     # the edge texture repeats every half metre
E_EDGE_V = (0.46, 0.54)                                      # the slice of the texture across the thickness

# ── Schöpfer's desk ───────────────────────────────────────────────────────────────────────────────────────────────
S_TOP_THICKNESS = 60.0                                       # the thick white top
S_LEG_RADIUS = 8.0                                           # Ø 16 slender steel legs
S_LEG_TOP_X, S_LEG_TOP_Y = 520.0, 350.0                      # where a leg meets the top (inside the corner)
S_LEG_FOOT_X, S_LEG_FOOT_Y = 760.0, 560.0                    # where it stands (outside the top: splayed)
S_CUTOUT_WIDTH, S_CUTOUT_HEIGHT, S_CUTOUT_DEPTH = 240.0, 26.0, 50.0
S_CUTOUT_X = (-400.0, 0.0, 400.0)                            # three cutouts along the front edge
S_CUTOUT_Z = (-40.0, -14.0)                                  # from the surface: the slot's bottom and top

# ── Materials ──────────────────────────────────────────────────────────────────────────────────────────────────────

def material(name, rgb, metallic, roughness):
    mat = bpy.data.materials.new(name)
    if mat.node_tree is None:
        mat.use_nodes = True
    principled = mat.node_tree.nodes.get("Principled BSDF")
    principled.inputs["Base Color"].default_value = (*rgb, 1.0)
    principled.inputs["Metallic"].default_value = metallic
    principled.inputs["Roughness"].default_value = roughness
    return mat

# ── Geometry ───────────────────────────────────────────────────────────────────────────────────────────────────────

def tube(bm, a, b, radius, segments=SEGMENTS):
    """An open round tube from `a` to `b` (Vectors), its side as quads"""
    axis = (b - a).normalized()
    ref = Vector((0, 0, 1)) if abs(axis.z) < 0.9 else Vector((1, 0, 0))
    u = axis.cross(ref).normalized()
    v = axis.cross(u).normalized()
    rings = []
    for centre in (a, b):
        ring = []
        for i in range(segments):
            angle = 2 * math.pi * i / segments
            ring.append(bm.verts.new(centre + (u * math.cos(angle) + v * math.sin(angle)) * radius))
        rings.append(ring)
    for i in range(segments):
        j = (i + 1) % segments
        bm.faces.new((rings[0][i], rings[0][j], rings[1][j], rings[1][i]))


def mesh_object(name, bm, materials, smooth=False):
    """A mesh object from `bm` (freed) with the material slots in order"""
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    for mat in materials:
        mesh.materials.append(mat)
    if smooth:
        for poly in mesh.polygons:
            poly.use_smooth = True
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(obj)
    return obj


def slab(bm, width, depth, thickness):
    """A box whose upper surface is z = 0, centred on the origin"""
    bmesh.ops.create_cube(bm, size=1.0)
    for vert in bm.verts:
        vert.co = Vector((vert.co.x * width, vert.co.y * depth, (vert.co.z - 0.5) * thickness))


def build_eiermann():
    bm = bmesh.new()
    slab(bm, TOP_WIDTH, TOP_DEPTH, E_TOP_THICKNESS)
    uv_layer = bm.loops.layers.uv.verify()
    for face in bm.faces:
        n = face.normal
        if abs(n.z) > 0.5:
            face.material_index = 0  # top: the stage's plywood map repeats over UV 0..1
            for loop in face.loops:
                loop[uv_layer].uv = (loop.vert.co.x / TOP_WIDTH + 0.5, loop.vert.co.y / TOP_DEPTH + 0.5)
        else:
            face.material_index = 1  # edge: the plies run along the edge
            along = (lambda co: co.y) if abs(n.x) > 0.5 else (lambda co: co.x)
            for loop in face.loops:
                t = (loop.vert.co.z + E_TOP_THICKNESS) / E_TOP_THICKNESS
                loop[uv_layer].uv = (along(loop.vert.co) / E_EDGE_REPEAT_MM, E_EDGE_V[0] + t * (E_EDGE_V[1] - E_EDGE_V[0]))
    top = mesh_object("Top", bm, (bpy.data.materials["top"], bpy.data.materials["edge"]))

    bm = bmesh.new()
    for sx in (-1, 1):
        x = sx * E_LEG_X
        for sy in (-1, 1):
            y = sy * E_LEG_Y
            tube(bm, Vector((x, y, FLOOR)), Vector((x, y, E_LEG_TOP)), E_TUBE_RADIUS)
            tube(bm, Vector((x, y, E_LEG_TOP - 20)), Vector((x, y, E_UNDERSIDE)), E_INNER_RADIUS)
        for z in (E_UPPER_BAR, E_LOWER_BAR):
            tube(bm, Vector((x, -E_LEG_Y, z)), Vector((x, E_LEG_Y, z)), E_TUBE_RADIUS)
    # The struts: each from one end's lower tube (at the back) up to the other end's upper tube (at the front)
    for sx in (-1, 1):
        tube(bm, Vector((-sx * E_LEG_X, E_STRUT_LOWER_Y, E_LOWER_BAR)), Vector((sx * E_LEG_X, E_STRUT_UPPER_Y, E_UPPER_BAR)), E_TUBE_RADIUS)
    frame = mesh_object("Frame", bm, (bpy.data.materials["steel"],), smooth=True)
    return [top, frame]


def build_schoepfer():
    bm = bmesh.new()
    slab(bm, TOP_WIDTH, TOP_DEPTH, S_TOP_THICKNESS)
    top = mesh_object("Top", bm, (bpy.data.materials["top"], bpy.data.materials["drawer"]))
    # The drawer cutouts: three boxes taken out of the front edge (a boolean, evaluated once and baked)
    bm = bmesh.new()
    for x in S_CUTOUT_X:
        result = bmesh.ops.create_cube(bm, size=1.0)
        bmesh.ops.scale(bm, vec=(S_CUTOUT_WIDTH, S_CUTOUT_DEPTH + 2, S_CUTOUT_HEIGHT), verts=result["verts"])
        bmesh.ops.translate(bm, vec=(x, -TOP_DEPTH / 2 + S_CUTOUT_DEPTH / 2 - 1, (S_CUTOUT_Z[0] + S_CUTOUT_Z[1]) / 2), verts=result["verts"])
    cutter = mesh_object("Cutter", bm, ())
    modifier = top.modifiers.new("cutouts", "BOOLEAN")
    modifier.operation = "DIFFERENCE"
    modifier.object = cutter
    evaluated = bpy.data.meshes.new_from_object(top.evaluated_get(bpy.context.evaluated_depsgraph_get()))
    top.modifiers.clear()
    old = top.data
    top.data = evaluated
    bpy.data.meshes.remove(old)
    bpy.data.objects.remove(cutter)
    for mat in (bpy.data.materials["top"], bpy.data.materials["drawer"]):
        if mat.name not in evaluated.materials:
            evaluated.materials.append(mat)
    for poly in evaluated.polygons:
        c = poly.center
        inside = any(abs(c.x - x) <= S_CUTOUT_WIDTH / 2 + 0.5 for x in S_CUTOUT_X)
        inside = inside and c.y <= -TOP_DEPTH / 2 + S_CUTOUT_DEPTH + 0.5 and S_CUTOUT_Z[0] - 0.5 <= c.z <= S_CUTOUT_Z[1] + 0.5
        front_face = c.y <= -TOP_DEPTH / 2 + 0.5
        poly.material_index = 1 if inside and not front_face else 0

    bm = bmesh.new()
    for sx in (-1, 1):
        for sy in (-1, 1):
            a = Vector((sx * S_LEG_TOP_X, sy * S_LEG_TOP_Y, -S_TOP_THICKNESS + 10))  # the join is inside the top
            b = Vector((sx * S_LEG_FOOT_X, sy * S_LEG_FOOT_Y, FLOOR))
            tube(bm, a, b, S_LEG_RADIUS)
    legs = mesh_object("Legs", bm, (bpy.data.materials["steel"],), smooth=True)
    return [top, legs]

# ── Build and export ───────────────────────────────────────────────────────────────────────────────────────────────

DESKS = {
    "desk-eiermann": (build_eiermann, {"top": ((0.23, 0.14, 0.09), 0.0, 0.5), "edge": ((0.78, 0.64, 0.46), 0.0, 0.7), "steel": ((0.16, 0.16, 0.17), 0.85, 0.4)}),
    "desk-schoepfer": (build_schoepfer, {"top": ((0.92, 0.92, 0.9), 0.0, 0.6), "drawer": ((0.12, 0.12, 0.12), 0.0, 0.9), "steel": ((0.9, 0.9, 0.89), 0.3, 0.5)}),
}


def export(name, build, materials, out_dir):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    for mat_name, (rgb, metallic, roughness) in materials.items():
        material(mat_name, rgb, metallic, roughness)
    desk = bpy.data.objects.new("Desk", None)
    bpy.context.scene.collection.objects.link(desk)
    for obj in build():
        obj.data.transform(Matrix.Scale(0.001, 4))  # millimetres to metres
        obj.parent = desk
    out = os.path.join(out_dir, f"{name}.glb")
    bpy.ops.export_scene.gltf(
        filepath=out,
        export_format="GLB",
        export_apply=True,
        export_yup=True,
        export_materials="EXPORT",
        export_image_format="NONE",
        export_animations=False,
        export_skins=False,
        export_cameras=False,
        export_lights=False,
    )
    triangles = 0
    for obj in bpy.data.objects:
        if obj.type == "MESH":
            obj.data.calc_loop_triangles()
            triangles += len(obj.data.loop_triangles)
    print(f"{name}: {triangles} triangles, {os.path.getsize(out)} bytes → {out}")


def main():
    args = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    out_dir = os.path.abspath(args[0] if args else os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "static", "models"))
    os.makedirs(out_dir, exist_ok=True)
    for name, (build, materials) in DESKS.items():
        export(name, build, materials, out_dir)


main()
