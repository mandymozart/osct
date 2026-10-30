"""
The editor stage's desk, built from primitives as low-poly glTF for `editor/src/lib/stage/mock-stage.ts`: a table on
Egon Eiermann's steel tube frame (Tischgestell 1, 1953) with two tops to choose from (the Stage panel's *top*, #226) –
its own screen-printed plywood top, and a linoleum top: blue-grey linoleum on an oak-faced plywood board, the board's
cut edges showing its plies. Both tops have the same outer size and surface height; the stage shows one of them.

    "C:/Program Files/Blender Foundation/Blender 5.1/blender.exe" -b -P editor/tools/desk-eiermann.py [-- out-dir]

Writes `desk-eiermann.glb` into `editor/static/models/` (next to this script's folder) unless another folder follows
`--`.

The Eiermann frame's measurements (mm) come from a 3ds Max model of the frame
(`01_E1_1100x660-exzentrisch`, not in the repository, 17 000 triangles): round tube Ø 20, four vertical legs with the
thinner Ø 17 inner tube of the height adjustment showing under the top, an upper and a lower cross tube per end
frame, and two diagonal struts that cross between the ends – from the back of one lower cross tube to the front of
the other's upper one, placed off the middle ("exzentrisch"). The clamps and screws of the original are left out.
The linoleum top's linoleum and oak came with #187. Every tube has eight segments, no caps where none shows, and no
bevels: a few hundred triangles.

Units: the scene is built in millimetres, Z up, and exported in metres, Y up (glTF). The origin is the centre of the
tops' upper surface, so the stage sets the table's height directly. Three meshes: `Frame`, `TopEiermann` and
`TopLinoleum` (the stage hides the top not chosen). Materials by name – the stage assigns its own look to the
Eiermann top's `top` (the plywood faces, UV 0..1 over the top) and `edge` (the board's cut sides: the plywood's plies,
drawn by the stage – `editor/src/lib/stage/plywood.ts`), and to the linoleum top's `linoleum` (the surface and the
layer's thin edge – `linoleum.ts`), `oak_edge` (the board's cut sides: the same plies in an oak tint) and `oak` (the
board's oak-veneered underside – `oak.ts`); `steel` (the frame) stays as exported. The edges' UVs: u runs along the
edge (one texture repeat every `EDGE_REPEAT_MM`), v through the board, one stack of plies from 0 at the underside to 1
at the board's upper face (the glTF export flips v; a whole stack doesn't mind) – both boards are 18 mm, so both show
13 plies per 18 mm. The linoleum: millimetres over `LINOLEUM_REPEAT_MM`, both ways; the oak: u along the grain (the
top's long side) in units of `OAK_U_MM`, v across it in units of `OAK_V_MM`.
"""

import os
import sys
import math

import bpy
import bmesh
from mathutils import Matrix, Vector

# ── The table (mm) ────────────────────────────────────────────────────────────────────────────────────────────────
TOP_WIDTH, TOP_DEPTH = 1800.0, 800.0                         # the stage's desk: 180 × 80 cm, both tops
HEIGHT = 720.0                                               # the floor to the tops' surface
FLOOR = -HEIGHT
SEGMENTS = 8
EDGE_REPEAT_MM = 250.0                                       # the plies' texture repeats every quarter metre along an edge

# ── The Eiermann top and frame ────────────────────────────────────────────────────────────────────────────────────
E_TOP_THICKNESS = 18.0                                       # a Siebdruckplatte
E_TUBE_RADIUS = 10.0                                         # Ø 20 round steel tube
E_INNER_RADIUS = 8.5                                         # the height adjustment's inner tube, Ø 17
E_LEG_X, E_LEG_Y = 540.0, 320.0                              # the legs' axes: the frame is 1080 × 640
E_UNDERSIDE = -E_TOP_THICKNESS
E_UPPER_BAR = E_UNDERSIDE - 112.0                            # the upper cross tube's axis under the top
E_LOWER_BAR = FLOOR + 140.0                                  # the lower cross tube's axis above the floor
E_LEG_TOP = E_UNDERSIDE - 55.0                               # the outer leg ends here, the inner tube shows above
E_STRUT_LOWER_Y, E_STRUT_UPPER_Y = 254.0, -144.0             # where the struts meet the lower and the upper tubes

# ── The linoleum top (#226): linoleum glued on an oak-faced plywood board ─────────────────────────────────────────
L_LINOLEUM = 2.0                                             # the linoleum layer, its edge a blue-grey line over the board
L_BOARD = 18.0                                               # the board under it: 18 mm, 13 plies like the Eiermann's
LINOLEUM_REPEAT_MM = 400.0                                   # the linoleum's speckle repeats every 40 cm
OAK_U_MM, OAK_V_MM = 500.0, 125.0                            # the oak veneer underneath: 50 cm along the grain, 12.5 cm across

# ── Materials ──────────────────────────────────────────────────────────────────────────────────────────────────────

def material(name, rgb, metallic, roughness, specular=None):
    """A Principled material; `specular` (Specular IOR Level, 0.5 = the default) exports as KHR_materials_specular"""
    mat = bpy.data.materials.new(name)
    if mat.node_tree is None:
        mat.use_nodes = True
    principled = mat.node_tree.nodes.get("Principled BSDF")
    principled.inputs["Base Color"].default_value = (*rgb, 1.0)
    principled.inputs["Metallic"].default_value = metallic
    principled.inputs["Roughness"].default_value = roughness
    if specular is not None:
        principled.inputs["Specular IOR Level"].default_value = specular
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


def edge_uv(co, normal, thickness, bottom=None):
    """An edge's UV (mm): u along the edge, v through the board – 0 at its underside (`bottom`, by default
    -`thickness`), 1 at its upper face: one stack of plies"""
    along = co.y if abs(normal.x) > 0.5 else co.x
    bottom = -thickness if bottom is None else bottom
    return (along / EDGE_REPEAT_MM, (co.z - bottom) / thickness)


def top_uv(co):
    """The top's faces: UV 0..1 over the top"""
    return (co.x / TOP_WIDTH + 0.5, co.y / TOP_DEPTH + 0.5)


def slab(bm, width, depth, thickness):
    """A box whose upper surface is z = 0, centred on the origin"""
    bmesh.ops.create_cube(bm, size=1.0)
    for vert in bm.verts:
        vert.co = Vector((vert.co.x * width, vert.co.y * depth, (vert.co.z - 0.5) * thickness))


def build_eiermann_top():
    """The Eiermann's own top: a screen-printed plywood board (Siebdruckplatte), 18 mm"""
    bm = bmesh.new()
    slab(bm, TOP_WIDTH, TOP_DEPTH, E_TOP_THICKNESS)
    uv_layer = bm.loops.layers.uv.verify()
    for face in bm.faces:
        n = face.normal
        if abs(n.z) > 0.5:
            face.material_index = 0  # top: the stage's plywood map repeats over UV 0..1
            for loop in face.loops:
                loop[uv_layer].uv = top_uv(loop.vert.co)
        else:
            face.material_index = 1  # edge: the plies run along the edge, stacked through the thickness
            for loop in face.loops:
                loop[uv_layer].uv = edge_uv(loop.vert.co, n, E_TOP_THICKNESS)
    return mesh_object("TopEiermann", bm, (bpy.data.materials["top"], bpy.data.materials["edge"]))


def rect(bm, x0, y0, x1, y1, z):
    """Four new vertices: a rectangle at height z, counter-clockwise from above"""
    return [bm.verts.new(co) for co in ((x0, y0, z), (x1, y0, z), (x1, y1, z), (x0, y1, z))]


def band(bm, upper, lower, material):
    """The four quads between two rings of four vertices"""
    faces = []
    for i in range(4):
        j = (i + 1) % 4
        face = bm.faces.new((upper[i], upper[j], lower[j], lower[i]))
        face.material_index = material
        faces.append(face)
    return faces


def build_linoleum_top():
    """The linoleum top (#226): a linoleum layer over the whole top – its edge a thin line of its own – glued on an
    18 mm oak-faced plywood board whose cut edges show its plies; one closed box, the Eiermann top's outer size"""
    w, d = TOP_WIDTH / 2, TOP_DEPTH / 2
    lino, ply, oak = 0, 1, 2
    bottom = -L_LINOLEUM - L_BOARD
    bm = bmesh.new()
    surface = rect(bm, -w, -d, w, d, 0.0)
    layer = rect(bm, -w, -d, w, d, -L_LINOLEUM)
    under = rect(bm, -w, -d, w, d, bottom)
    bm.faces.new(surface).material_index = lino
    lino_edges = band(bm, surface, layer, lino)
    ply_edges = band(bm, layer, under, ply)
    bm.faces.new(under[::-1]).material_index = oak
    uv_layer = bm.loops.layers.uv.verify()
    for face in bm.faces:
        face.normal_update()
        for loop in face.loops:
            co = loop.vert.co
            if face in ply_edges:
                loop[uv_layer].uv = edge_uv(co, face.normal, L_BOARD, bottom)
            elif face in lino_edges:
                along = co.y if abs(face.normal.x) > 0.5 else co.x
                loop[uv_layer].uv = (along / LINOLEUM_REPEAT_MM, co.z / LINOLEUM_REPEAT_MM)
            elif face.material_index == lino:
                loop[uv_layer].uv = (co.x / LINOLEUM_REPEAT_MM, co.y / LINOLEUM_REPEAT_MM)
            else:
                loop[uv_layer].uv = (co.x / OAK_U_MM, co.y / OAK_V_MM)
    materials = tuple(bpy.data.materials[n] for n in ("linoleum", "oak_edge", "oak"))
    return mesh_object("TopLinoleum", bm, materials)


def build_frame():
    """Eiermann's frame: four legs with the inner tubes above them, two cross tubes per end, the two struts"""
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
    return mesh_object("Frame", bm, (bpy.data.materials["steel"],), smooth=True)


def build_desk():
    return [build_eiermann_top(), build_linoleum_top(), build_frame()]

# ── Build and export ───────────────────────────────────────────────────────────────────────────────────────────────

# Materials: (base colour – linear, metallic, roughness[, specular level]). The frame is powder-coated steel, not bare
# metal: a metal shows almost only what it reflects, and thin dark tubes would vanish before a dark studio or under the
# stage's own lights. The tops' materials get the stage's drawn or loaded textures; these colours stand in for them
# elsewhere (a glTF viewer).
MATERIALS = {
    "top": ((0.23, 0.14, 0.09), 0.0, 0.5),
    "edge": ((0.78, 0.64, 0.46), 0.0, 0.7),
    "linoleum": ((0.22, 0.34, 0.5), 0.0, 0.8),
    "oak_edge": ((0.62, 0.45, 0.27), 0.0, 0.7),
    "oak": ((0.55, 0.42, 0.28), 0.0, 0.6),
    "steel": ((0.16, 0.16, 0.17), 0.15, 0.45),
}


def export(name, build, materials, out_dir):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    for mat_name, values in materials.items():
        material(mat_name, *values)
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
    export("desk-eiermann", build_desk, MATERIALS, out_dir)


main()
