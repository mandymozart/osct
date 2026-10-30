"""
The editor stage's desks, built from primitives as low-poly glTF for `editor/src/lib/stage/mock-stage.ts` (the Stage
panel's *desk* choice): a table on Egon Eiermann's steel tube frame (Tischgestell 1, 1953) with a screen-printed
plywood top, and Philipp Camille Schöpfer's desk – a thin sandwich top (linoleum on an aluminium core, an oak edge
band all round) with three open oak drawers hanging under its front edge, on a black powder-coated steel frame: a flat
rim under the top and, at each end, two straight legs splayed outward in a narrow A, each with a strut up to the end of
the rim (a Y seen from the front).

    "C:/Program Files/Blender Foundation/Blender 5.1/blender.exe" -b -P editor/tools/desk-eiermann.py [-- out-dir]

Writes `desk-eiermann.glb` and `desk-schoepfer.glb` into `editor/static/models/` (next to this script's folder) unless
another folder follows `--`.

The Eiermann frame's measurements (mm) come from a 3ds Max model of the frame
(`01_E1_1100x660-exzentrisch`, not in the repository, 17 000 triangles): round tube Ø 20, four vertical legs with the
thinner Ø 17 inner tube of the height adjustment showing under the top, an upper and a lower cross tube per end
frame, and two diagonal struts that cross between the ends – from the back of one lower cross tube to the front of
the other's upper one, placed off the middle ("exzentrisch"). The clamps and screws of the original are left out.
Schöpfer's desk is modelled after the manufacturer's catalogue photographs (#187, not in the repository): the frame's
proportions from its side view (M 2000 × 900 × 750, scaled to our 1800 × 800 top, the height kept at 750), the top's
build from the catalogue's "aluminium sandwich, oak wood, linoleum". Every tube has eight segments, no caps where none
shows, and no bevels; Schöpfer's frame is square and flat steel (closed boxes): a few hundred triangles a desk.

Units: the scene is built in millimetres, Z up, and exported in metres, Y up (glTF). The origin is the centre of the
top's upper surface, so the stage sets the table's height directly. Materials by name – the stage assigns its own
look to the Eiermann's `top` (the plywood faces, UV 0..1 over the top) and `edge` (the board's cut sides: the
plywood's plies, drawn by the stage – `editor/src/lib/stage/plywood.ts`) and to Schöpfer's `linoleum` and `oak`
(drawn by the stage – `linoleum.ts`, `oak.ts`); `steel` (the frames), Schöpfer's `aluminium` (the top's underside)
and `drawer` (the drawers' dark inside) stay as exported. The Eiermann edges' UVs: u runs along the edge (one texture
repeat every `EDGE_REPEAT_MM`), v through the thickness, one stack of plies from 0 at the underside to 1 at the top
surface (the glTF export flips v; a whole stack doesn't mind). Schöpfer's oak: u along the grain – the longer side of
each face, so the grain runs along the edge band and along each drawer wall – in units of `OAK_U_MM`, v across it in
units of `OAK_V_MM`; the linoleum: millimetres over `LINOLEUM_REPEAT_MM`, both ways.
"""

import os
import sys
import math

import bpy
import bmesh
from mathutils import Matrix, Vector

# ── Both tables (mm) ──────────────────────────────────────────────────────────────────────────────────────────────
TOP_WIDTH, TOP_DEPTH = 1800.0, 800.0                         # the stage's desks: 180 × 80 cm
HEIGHT = 720.0                                               # the Eiermann's floor to the top's surface
FLOOR = -HEIGHT
SEGMENTS = 8
EDGE_REPEAT_MM = 250.0                                       # the plies' texture repeats every quarter metre along an edge

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

# ── Schöpfer's desk ───────────────────────────────────────────────────────────────────────────────────────────────
S_HEIGHT = 750.0                                             # the catalogue's 75 cm, floor to the top's surface
S_FLOOR = -S_HEIGHT
# The top: a sandwich panel, not a board – the linoleum a layer of its own over the whole top, under it the oak edge
# band all round (the aluminium core inside it shows only from below)
S_LINOLEUM = 4.0                                             # the linoleum layer, its edge a blue-grey line over the oak
S_PANEL = 24.0                                               # linoleum and core: the top's whole thickness
S_BAND = 12.0                                                # the oak band's width, seen on the underside
LINOLEUM_REPEAT_MM = 400.0                                   # the linoleum's speckle repeats every 40 cm
OAK_U_MM, OAK_V_MM = 500.0, 125.0                            # the oak texture: 50 cm along the grain, 12.5 cm across
# The frame (black powder-coated steel): a flat rim under the top, at each end two square legs in a narrow A (seen
# from the end) and a strut from each leg up to the rim's end (a Y seen from the front). From the catalogue's side
# view: the legs meet the rim 293 mm in from its end of 2000 and stand 49 mm in, the struts leave them 135 mm under
# the rim – the lengths scaled by 0.9 to our 1800 mm top, the heights kept
S_RIM_GAP = 0.5                                              # the rim lies under the top (no shared face to flicker)
S_RIM_THICK, S_RIM_WIDTH = 5.0, 40.0                         # flat steel 40 × 5, lying flat
S_RIM_Y = 355.0                                              # the long bars' middle (inside the top's edge)
S_RIM_X = 855.0                                              # the end bars' middle
S_LEG = 20.0                                                 # 20 × 20 square legs
S_LEG_TOP_X, S_LEG_TOP_Y = 636.0, 350.0                      # where a leg meets the rim (under its long bar)
S_LEG_FOOT_X, S_LEG_FOOT_Y = 856.0, 400.0                    # where it stands: splayed out to the ends, a narrow A
S_STRUT = 16.0                                               # 16 × 16 square struts
S_STRUT_DROP = 135.0                                         # where a strut leaves its leg, under the rim
# The drawers: three open oak trays hanging under the front edge, just under the rim (their bottoms 80 mm under the
# surface – the catalogue's 8 cm), pulled out towards the sitter by different amounts so their dark insides show
S_DRAWER_X = (-420.0, 0.0, 420.0)
S_DRAWER_PULL = (150.0, 60.0, 110.0)                         # how far each sticks out over the front edge
S_DRAWER_WIDTH, S_DRAWER_DEPTH = 360.0, 300.0
S_DRAWER_BOTTOM = -80.0
S_DRAWER_WALL, S_DRAWER_FLOOR = 10.0, 6.0

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


def edge_uv(co, normal, thickness, stacks=1):
    """An edge's UV (mm): u along the edge, v through the thickness – 0 at the underside, `stacks` at the top"""
    along = co.y if abs(normal.x) > 0.5 else co.x
    return (along / EDGE_REPEAT_MM, (co.z + thickness) / thickness * stacks)


def top_uv(co):
    """The top's faces: UV 0..1 over the top"""
    return (co.x / TOP_WIDTH + 0.5, co.y / TOP_DEPTH + 0.5)


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
                loop[uv_layer].uv = top_uv(loop.vert.co)
        else:
            face.material_index = 1  # edge: the plies run along the edge, stacked through the thickness
            for loop in face.loops:
                loop[uv_layer].uv = edge_uv(loop.vert.co, n, E_TOP_THICKNESS)
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


def axis_box(bm, lo, hi):
    """A closed box between the corners `lo` and `hi` (any order per axis)"""
    a = [min(lo[i], hi[i]) for i in range(3)]
    b = [max(lo[i], hi[i]) for i in range(3)]
    result = bmesh.ops.create_cube(bm, size=1.0)
    for vert in result["verts"]:
        vert.co = Vector(tuple(a[i] + (vert.co[i] + 0.5) * (b[i] - a[i]) for i in range(3)))


def beam(bm, a, b, size):
    """A closed square beam of `size` from `a` to `b` (Vectors), two of its sides upright"""
    axis = (b - a).normalized()
    ref = Vector((0, 1, 0)) if abs(axis.y) < 0.9 else Vector((1, 0, 0))
    u = axis.cross(ref).normalized()
    v = axis.cross(u).normalized()
    square = ((-1, -1), (1, -1), (1, 1), (-1, 1))
    ends = [[bm.verts.new(centre + (u * su + v * sv) * (size / 2)) for su, sv in square] for centre in (a, b)]
    bm.faces.new(ends[0])
    bm.faces.new(ends[1])
    for i in range(4):
        j = (i + 1) % 4
        bm.faces.new((ends[0][i], ends[0][j], ends[1][j], ends[1][i]))


def rect(bm, x0, y0, x1, y1, z):
    """Four new vertices: a rectangle at height z, counter-clockwise from above"""
    return [bm.verts.new(co) for co in ((x0, y0, z), (x1, y0, z), (x1, y1, z), (x0, y1, z))]


def band(bm, upper, lower, material):
    """The four quads between two rings of four vertices"""
    for i in range(4):
        j = (i + 1) % 4
        bm.faces.new((upper[i], upper[j], lower[j], lower[i])).material_index = material


def plane_uv(bm, scale_for):
    """UVs per face from its plane: u along its longer side, v across – in millimetres over the face material's
    (u, v) scale, or none (a zero map) for a material without a texture"""
    uv_layer = bm.loops.layers.uv.verify()
    for face in bm.faces:
        scale = scale_for(face.material_index)
        face.normal_update()
        normal_axis = max(range(3), key=lambda k: abs(face.normal[k]))
        a, b = [k for k in range(3) if k != normal_axis]
        cos = [loop.vert.co for loop in face.loops]
        extent = lambda k: max(co[k] for co in cos) - min(co[k] for co in cos)
        u, v = (a, b) if extent(a) >= extent(b) else (b, a)
        for loop in face.loops:
            co = loop.vert.co
            loop[uv_layer].uv = (co[u] / scale[0], co[v] / scale[1]) if scale else (0.0, 0.0)


def build_schoepfer():
    w, d = TOP_WIDTH / 2, TOP_DEPTH / 2
    lino, oak, aluminium = 0, 1, 2

    # The top: the linoleum over the whole top (its edge a thin layer of its own), the oak band under it all round,
    # the aluminium core's underside inside the band – one closed panel, 24 mm
    bm = bmesh.new()
    surface = rect(bm, -w, -d, w, d, 0.0)
    layer = rect(bm, -w, -d, w, d, -S_LINOLEUM)
    under = rect(bm, -w, -d, w, d, -S_PANEL)
    core = rect(bm, -w + S_BAND, -d + S_BAND, w - S_BAND, d - S_BAND, -S_PANEL)
    bm.faces.new(surface).material_index = lino
    band(bm, surface, layer, lino)
    band(bm, layer, under, oak)
    band(bm, under, core, oak)
    bm.faces.new(core[::-1]).material_index = aluminium
    plane_uv(bm, lambda m: (LINOLEUM_REPEAT_MM, LINOLEUM_REPEAT_MM) if m == lino else (OAK_U_MM, OAK_V_MM) if m == oak else None)
    top = mesh_object("Top", bm, tuple(bpy.data.materials[n] for n in ("linoleum", "oak", "aluminium")))

    # The drawers: open oak trays (a bottom and four walls, the top open) just under the rim, pulled out over the
    # front edge; their inside is dark
    rim_top = -S_PANEL - S_RIM_GAP
    rim_bottom = rim_top - S_RIM_THICK
    drawer_top = rim_bottom - S_RIM_GAP
    bm = bmesh.new()
    wood, inside = 0, 1
    for cx, pull in zip(S_DRAWER_X, S_DRAWER_PULL):
        x0, x1 = cx - S_DRAWER_WIDTH / 2, cx + S_DRAWER_WIDTH / 2
        y0 = -d - pull
        y1 = y0 + S_DRAWER_DEPTH
        t = S_DRAWER_WALL
        outer_bottom = rect(bm, x0, y0, x1, y1, S_DRAWER_BOTTOM)
        outer_top = rect(bm, x0, y0, x1, y1, drawer_top)
        inner_top = rect(bm, x0 + t, y0 + t, x1 - t, y1 - t, drawer_top)
        inner_bottom = rect(bm, x0 + t, y0 + t, x1 - t, y1 - t, S_DRAWER_BOTTOM + S_DRAWER_FLOOR)
        bm.faces.new(outer_bottom[::-1]).material_index = wood
        band(bm, outer_top, outer_bottom, wood)
        band(bm, outer_top, inner_top, wood)
        band(bm, inner_top, inner_bottom, inside)
        bm.faces.new(inner_bottom).material_index = inside
    plane_uv(bm, lambda m: (OAK_U_MM, OAK_V_MM) if m == wood else None)
    drawers = mesh_object("Drawers", bm, (bpy.data.materials["oak"], bpy.data.materials["drawer"]))

    # The frame: closed boxes that run into each other, so no two faces share a plane
    bm = bmesh.new()
    rim_long = S_RIM_X + S_RIM_WIDTH / 2 + 2                  # the long bars reach past the end bars
    for sy in (-1, 1):
        axis_box(bm, (-rim_long, sy * (S_RIM_Y - S_RIM_WIDTH / 2), rim_bottom), (rim_long, sy * (S_RIM_Y + S_RIM_WIDTH / 2), rim_top))
    for sx in (-1, 1):
        axis_box(bm, (sx * (S_RIM_X - S_RIM_WIDTH / 2), -(S_RIM_Y + 15), rim_bottom + 0.1), (sx * (S_RIM_X + S_RIM_WIDTH / 2), S_RIM_Y + 15, rim_top - 0.1))
    joint = (rim_top + rim_bottom) / 2                        # legs and struts end inside the rim
    for sx in (-1, 1):
        for sy in (-1, 1):
            a = Vector((sx * S_LEG_TOP_X, sy * S_LEG_TOP_Y, joint))
            b = Vector((sx * S_LEG_FOOT_X, sy * S_LEG_FOOT_Y, S_FLOOR))
            beam(bm, a, b, S_LEG)
            fork = a.lerp(b, (a.z - (rim_bottom - S_STRUT_DROP)) / (a.z - b.z))
            beam(bm, fork, Vector((sx * S_RIM_X, fork.y, joint)), S_STRUT)
    frame = mesh_object("Frame", bm, (bpy.data.materials["steel"],))
    return [top, drawers, frame]

# ── Build and export ───────────────────────────────────────────────────────────────────────────────────────────────

# Materials: (base colour – linear, metallic, roughness[, specular level]). The frames are powder-coated steel, not
# bare metal: a metal shows almost only what it reflects, and thin dark tubes would vanish before a dark studio or
# under the stage's own lights. Schöpfer's is black, matt with a slight sheen: a matt coat reflects little (specular
# level 0.15 of the default 0.5) – the studio HDRIs' bright lights would otherwise wash its flat faces out to tan.
# Its `linoleum` and `oak` get the stage's drawn textures, these colours stand in for them elsewhere (a glTF viewer);
# `drawer` is the trays' dark inside.
DESKS = {
    "desk-eiermann": (build_eiermann, {"top": ((0.23, 0.14, 0.09), 0.0, 0.5), "edge": ((0.78, 0.64, 0.46), 0.0, 0.7), "steel": ((0.16, 0.16, 0.17), 0.15, 0.45)}),
    "desk-schoepfer": (build_schoepfer, {
        "linoleum": ((0.22, 0.34, 0.5), 0.0, 0.8),
        "oak": ((0.55, 0.42, 0.28), 0.0, 0.6),
        "aluminium": ((0.6, 0.61, 0.63), 0.4, 0.45),
        "drawer": ((0.025, 0.023, 0.021), 0.0, 0.9),
        "steel": ((0.022, 0.022, 0.024), 0.0, 0.55, 0.15),
    }),
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
    for name, (build, materials) in DESKS.items():
        export(name, build, materials, out_dir)


main()
