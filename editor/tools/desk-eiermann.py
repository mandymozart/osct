"""
The editor stage's desk: a table on Egon Eiermann's steel tube frame (Tischgestell 1, 1953) with a screen-printed
plywood top, built from primitives as a low-poly glTF for `editor/src/lib/stage/mock-stage.ts`.

    "C:/Program Files/Blender Foundation/Blender 5.1/blender.exe" -b -P editor/tools/desk-eiermann.py [-- out.glb]

Writes `editor/static/models/desk-eiermann.glb` (next to this script's folder) unless another path follows `--`.

The frame's measurements (mm) come from a 3ds Max model of the frame Tilman supplied (`01_E1_1100x660-exzentrisch`,
not in the repository, 17 000 triangles): round tube Ø 20, four vertical legs with the thinner Ø 17 inner tube of the
height adjustment showing under the top, an upper and a lower cross tube per end frame, and two diagonal struts that
cross between the ends – from the back of one lower cross tube to the front of the other's upper one, placed off the
middle ("exzentrisch"). The clamps and screws of the original are left out. This model has every tube with eight
segments, no caps where none shows, and no bevels: a few hundred triangles.

Units: the scene is built in millimetres, Z up, and exported in metres, Y up (glTF). The origin is the centre of the
top's upper surface, so the stage sets the table's height directly. Materials by name – the stage assigns its own
textures to `top` (the plywood faces, UV 0..1 over the top) and `edge` (the cut edges, the plies along the edge);
`steel` is the frame's plain metal.
"""

import os
import sys
import math

import bpy
import bmesh
from mathutils import Matrix, Vector

# ── The table (mm) ────────────────────────────────────────────────────────────────────────────────────────────────
TOP_WIDTH, TOP_DEPTH, TOP_THICKNESS = 1400.0, 1000.0, 18.0   # the stage's table, a Siebdruckplatte
HEIGHT = 720.0                                               # floor to the top's surface
TUBE_RADIUS = 10.0                                           # Ø 20 round steel tube
INNER_RADIUS = 8.5                                           # the height adjustment's inner tube, Ø 17
SEGMENTS = 8
LEG_X, LEG_Y = 540.0, 320.0                                  # the legs' axes: the frame is 1080 × 640
UNDERSIDE = -TOP_THICKNESS
FLOOR = -HEIGHT
UPPER_BAR = UNDERSIDE - 112.0                                # the upper cross tube's axis under the top
LOWER_BAR = FLOOR + 140.0                                    # the lower cross tube's axis above the floor
LEG_TOP = UNDERSIDE - 55.0                                   # the outer leg ends here, the inner tube shows above
STRUT_LOWER_Y, STRUT_UPPER_Y = 254.0, -144.0                 # where the struts meet the lower and the upper tubes
EDGE_REPEAT_MM = 500.0                                       # the edge texture repeats every half metre
EDGE_V = (0.46, 0.54)                                        # the slice of the texture across the thickness

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


def build_frame():
    bm = bmesh.new()
    for sx in (-1, 1):
        x = sx * LEG_X
        for sy in (-1, 1):
            y = sy * LEG_Y
            tube(bm, Vector((x, y, FLOOR)), Vector((x, y, LEG_TOP)), TUBE_RADIUS)
            tube(bm, Vector((x, y, LEG_TOP - 20)), Vector((x, y, UNDERSIDE)), INNER_RADIUS)
        for z in (UPPER_BAR, LOWER_BAR):
            tube(bm, Vector((x, -LEG_Y, z)), Vector((x, LEG_Y, z)), TUBE_RADIUS)
    # The struts: each from one end's lower tube (at the back) up to the other end's upper tube (at the front)
    for sx in (-1, 1):
        tube(bm, Vector((-sx * LEG_X, STRUT_LOWER_Y, LOWER_BAR)), Vector((sx * LEG_X, STRUT_UPPER_Y, UPPER_BAR)), TUBE_RADIUS)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    mesh = bpy.data.meshes.new("Frame")
    bm.to_mesh(mesh)
    bm.free()
    mesh.materials.append(bpy.data.materials["steel"])
    for poly in mesh.polygons:
        poly.use_smooth = True
    return bpy.data.objects.new("Frame", mesh)


def build_top():
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    for vert in bm.verts:
        vert.co = Vector((vert.co.x * TOP_WIDTH, vert.co.y * TOP_DEPTH, (vert.co.z - 0.5) * TOP_THICKNESS))
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
                t = (loop.vert.co.z + TOP_THICKNESS) / TOP_THICKNESS
                loop[uv_layer].uv = (along(loop.vert.co) / EDGE_REPEAT_MM, EDGE_V[0] + t * (EDGE_V[1] - EDGE_V[0]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    mesh = bpy.data.meshes.new("Top")
    bm.to_mesh(mesh)
    bm.free()
    mesh.materials.append(bpy.data.materials["top"])
    mesh.materials.append(bpy.data.materials["edge"])
    return bpy.data.objects.new("Top", mesh)

# ── Build and export ───────────────────────────────────────────────────────────────────────────────────────────────

def main():
    args = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    out = args[0] if args else os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "static", "models", "desk-eiermann.glb")
    out = os.path.abspath(out)

    bpy.ops.wm.read_factory_settings(use_empty=True)
    material("top", (0.23, 0.14, 0.09), 0.0, 0.5)
    material("edge", (0.78, 0.64, 0.46), 0.0, 0.7)
    material("steel", (0.16, 0.16, 0.17), 0.85, 0.4)
    desk = bpy.data.objects.new("Desk", None)
    bpy.context.scene.collection.objects.link(desk)
    for obj in (build_top(), build_frame()):
        obj.data.transform(Matrix.Scale(0.001, 4))  # millimetres to metres
        obj.parent = desk
        bpy.context.scene.collection.objects.link(obj)

    os.makedirs(os.path.dirname(out), exist_ok=True)
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
    triangles = sum(len(obj.data.loop_triangles) for obj in bpy.data.objects if obj.type == "MESH" and (obj.data.calc_loop_triangles() or True))
    print(f"desk-eiermann: {triangles} triangles, {os.path.getsize(out)} bytes → {out}")


main()
