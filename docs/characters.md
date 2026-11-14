# Characters from Blender

How a rigged, animated character from Blender becomes a model the reader plays: Kévin's remesh flow, the bake for rigs
whose topology changes, and the budgets measured with Mark the Page (#253). Automating it is #256.

## What the reader plays

A `model` node with a glTF 2.0 file (`.glb`), its clips played by the `animation` component (`playOn`, `stopOn`,
`loop`, `speed` – [content](content.md)). The engine's loader decodes meshopt compression (gltf-transform `meshopt`);
there is no Draco decoder. glTF carries skinning, morph targets and node animation – not Blender's modifiers, drivers,
geometry nodes or booleans: whatever those do must be baked or applied before the export.

## Kévin's remesh flow

Kévin's way to turn a heavy model into an even quad mesh with the same shape (Kévin via Tilman, 2026-11-14):

1. **Quad Remesher 1.2** (Exoside's add-on) on the high-resolution model, target quad count **500**. The result is a
   new, simplified object.
2. Select the **simplified object**.
3. Add a **Multiresolution** modifier and **Subdivide** it 3 to 4 times.
4. Add a **Shrinkwrap** modifier after it. **Target: the high-resolution model.**
5. Wrap method **Project**, and switch **Negative** on (Positive is on already), so each vertex is projected along its
   normal in both directions until it lands on the original surface.

The subdivided, shrinkwrapped levels **regain the original's quality** on clean, evenly spread quads. They are not what
the reader gets: they are the source for the **normals** – baked from the high levels onto the 500-quad base, which is
what the reader draws (Tilman, 2026-11-14: *"its regaining the quality – if use this for the normals"*). Two outputs:

- **Separate**: each part keeps its own low mesh and its own baked maps (normals, colour) – the full version.
- **One** (the lower version): everything baked into one mesh and one set of maps (*"a lower version we just bake
  everything into one"*).

| Parameter | Kévin's value | Note |
|---|---|---|
| Quad Remesher target count | 500 | the mesh the reader draws: about 1,000 triangles |
| Multiresolution subdivisions | 3–4 | the bake's source, never exported: each level multiplies the faces by 4 (32,000 quads at 3, 128,000 at 4) |
| Shrinkwrap | Project, Positive and Negative, target = the high-resolution model | |
| Bake | normals from the high levels onto the base | the map size per part is still to settle |

**The bake** (Cycles, *Bake › Selected to Active*): select the **high-resolution** object first, then the **low-resolution**
one, so the low one is the active object, then **Bake** – the maps land in the low object's image. The low object needs
UVs for that. *Separate* bakes each part this way; *one* joins the parts first and bakes once.

Open questions for Kévin: the normal map's size per part, and whether the colour is baked as well (the trial uses vertex
colours and no textures).

Quad Remesher needs a licence and is not installed on the development PC. Blender's built-in **QuadriFlow** remesh
(`Remesh › QuadriFlow`, target faces; `bpy.ops.object.quadriflow_remesh` in a script) does the same step without one, at
a different quality – the automation's default until a licence is there.

Not an option (checked 2026-11-14): the free `microdevweb/blender-quad-remesher` on GitHub. Its *Remesh* operator is a
placeholder that only reports "Remeshing executed!", its panel calls an operator name that does not exist, the helper
functions only subdivide and smooth, and it has no release and no licence file.

## Rigs whose topology changes: one mesh per frame

Mark is a sheet of paper with his face cut through it by **booleans**, so the sheet's vertex count changes every frame
(8,716 to 9,274 in the frames sampled). Skinning and morph targets need the same vertices in every frame, so they cannot
carry it. The trial bakes the evaluated scene **frame by frame** into one GLB: a mesh per frame under a node per frame,
and one clip whose STEP keys move every frame but the current one out of view (three.js culls it – no draw call) and
scale it to zero at rest. It plays through the plain `model` node and `animation` component. Colours and shading are
baked into vertex colours under an unlit material, so the stage's light does not change Kévin's look.

The remesh flow suits the parts that keep their topology (the tongue, the pupils): a 500-quad base with baked normals
replaces their thousands of triangles, and a normal map needs a material with a texture – the trial's unlit vertex
colours would change to a lit (or a plugin's) material. For the sheet it can give a mesh of
fixed topology – the Shrinkwrap follows the animated high-resolution sheet every frame – but the cut-outs cannot be
carried by fixed geometry: that route needs the holes as a mask (a plugin) and is not tried yet.

## Budget: what Mark measured

189 frames at 12 fps (Kévin's 24 fps, every second frame), 15.75 s; triangles per frame after simplifying:

| Step | Triangles | GLB |
|---|---|---|
| First bake | 9,309 | 7.4 MB |
| The sheet's triangles that face away from a reader in front dropped | 8,844 | 7.1 MB |
| Flat areas merged (planar decimate, 1°) | 8,795 | 7.0 MB |
| **Tongue and pupils one subdivision coarser, tongue one-sided** | **2,511** | **3.2 MB** (staging's demo book) |
| Stronger simplify (meshoptimizer error 0.006) | 2,101 | 2.7 MB |
| The same at 8 fps | 2,098 | 1.8 MB |

The tongue was the waste: 2,704 triangles, written for both sides, every frame. Not measured yet: a phone.

## Tools

- Blender 5.1 in background mode (`blender -b file.blend --factory-startup --disable-autoexec -P script.py`): the
  bake, subdivision levels, Decimate, QuadriFlow. The trial's scripts are outside the repository,
  `C:\Development\tools\osct\mark\` (`bake_flipbook.py`, `post.mjs` and the inspection scripts).
- gltf-transform with meshoptimizer (already in `scripts/`): simplify, quantize, meshopt compression.
