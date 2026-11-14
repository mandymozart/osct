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

## Trial: Kévin's *face against face* (2026-11-14)

Two ZBrush meshes (444,800 + 386,560 triangles) with one material and three 4K maps, 75 MB. Run through the Blender
MCP add-on (Blender Lab's, port 9876 – it starts only with Blender's online access on: `blender --online-mode`), with
QuadriFlow in place of Quad Remesher, the bake on the GPU in about 4 s per map:

| | Triangles | GLB | Look |
|---|---|---|---|
| Original | 831,360 | 75 MB | |
| **Separate** – each mesh 500 quads at Multiresolution level 1, own 2048 maps (colour, normals, roughness) | 5,976 | 3.1 MB | close to the original; the lowest edge a little ragged |
| **One** – both joined at level 0, one 2048 map set | 1,494 | 1.7 MB | softer outline, a few seams |

What the automation must do that the hand flow does not say:

- **QuadriFlow needs a closed, clean surface.** On the raw ZBrush mesh it gives overlapping, flipped faces. A voxel remesh
  first (0.05 on a 5.5-unit model), merged vertices, consistent normals and the non-manifold spots removed – then
  QuadriFlow is clean (Quad Remesher may not need this).
- **No projection limit on the Shrinkwrap**: a limit leaves the vertices that miss where they were – tears.
- **The bake's rays must reach the high model**: the further the low surface lies from it, the longer they must be
  (cage extrusion 0.08 / ray 0.3 for level 1, 0.25 / 0.8 for level 0). Too short shows as black patches.
- **Export only the active scene and the selected objects** (`use_active_scene`, and deselect hidden objects too):
  the glTF exporter takes every scene by default.
- **glTF has no quads**: every export is triangles (the GLB above is 5,976 triangles = 2,988 quads in Blender). The quad
  meshes stay in the `.blend` saved with the results, for further work by hand.

**Light from the camera, baked** (Tilman, 2026-11-14): a sun along the camera's view and a soft grey world as fill,
baked into the colour map (Cycles *Diffuse*: direct, indirect, colour), exported **unlit** (the colour map straight into
the material output – the exporter writes `KHR_materials_unlit`), so the reader shows the bake as it is and the stage's
light does not add to it. Only the high models may cast light and shadow during that bake: the lows and earlier bakes
lie on the same surface and shadow it into black patches.

| | Triangles | GLB |
|---|---|---|
| Separate, lit from the camera (one 2048 colour map per mesh) | 5,976 | 0.9 MB |
| One, lit from the camera | 1,494 | 0.5 MB |
| Separate, lit with gloss (*Combined*: diffuse and glossy) | 5,976 | 0.9 MB |

A glossy black part (the ear) bakes near black with *Diffuse* alone; with gloss it gets its sheen back, but lighter and
more silver than the original, since a bake has no view direction; and it takes 20 s per map instead of 4.

Scripts and results: `C:\Development\tools\osct\remesh\` (`bl.py` sends a script to the MCP bridge; `s1_import`,
`s2_remesh`, `s3_bake`, `s4_check`; `out/`).

## The workflow, step by step (what the batch does, in Blender's words)

Per model; steps 2–6 for every object of it, one after another.

1. **Open** the model: a `.blend` with its own world and lights, or a `.glb` imported into the lighting template (the
   sunset HDRI and two point lights of the hand-made file, moved and scaled to the model's size).
2. **Duplicate** the high-resolution object; the copy becomes the low one.
3. **Clean** the copy: *Remesh* modifier, *Voxel*, voxel size = model size / 110, apply; *Merge by Distance*,
   *Recalculate Outside*, delete non-manifold vertices, *Fill Holes*. (QuadriFlow needs a closed surface; Quad Remesher
   may not.)
4. **Quad remesh** the copy: *Remesh › QuadriFlow*, target 750 faces (Quad Remesher 1.2 at 500 in Kévin's flow lands at
   about the same count).
5. **Multiresolution**: add it, *Subdivide* 3 times. **Shrinkwrap** after it: target = the high-resolution object, *Project*,
   *Negative* and *Positive* on, no limit. Then set Multiresolution back to level 0 and apply both – the low object is the
   remeshed base, pulled onto the high surface.
6. **UVs**: *Smart UV Project* on the low object (angle 66°, margin 0.005).
7. **Bake** (Cycles, GPU, 128 samples, *Combined*: direct, indirect, diffuse, glossy, transmission, emission; *Selected
   to Active*, extrusion = model size × 0.036, max ray distance × 3.2, margin *Adjacent Faces*, 8 px at the smallest map
   shipped – see "Padding against seams" below): a new 1024 image on
   the low object; select the **high** object first, then the **low** one (active); only the high objects cast light and
   shadow; *Bake*.
8. **Material**: the baked image straight into the *Material Output* (unlit), backface culling off (double-sided).
9. **Export** glTF binary: the low objects only, the active scene only, images as PNG. With `--one` the lows are also
   joined, unwrapped and baked again into one map.
10. **Check**: the original and the exported GLB rendered front and side (Eevee, one sun), side by side.

## The batch: many models in one command

Tilman's hand-made version of *face against face* (2026-11-14) is the reference the batch matches: each object remeshed
to its base (no Multiresolution level exported), one 1024 map per object, baked *Combined* under the scene's own light (a
sunset HDRI and two point lights), exported unlit and double-sided – 3,056 triangles, 1.6 MB.

```
python C:\Development\tools\osct\remesh\batch.py <models or folders> --out <folder> [-- --one --faces 750 ...]
```

- One Blender process per model (headless, `--factory-startup --disable-autoexec`), one after another; each model gets
  `<out>/<name>/`: the GLB, `_one.glb` with `--one`, the baked maps, a report (triangles, sizes, seconds per step), the
  original and the result rendered front and side, and `_sheet.png` with all four. `<out>/summary.json` and a table
  at the end.
- **Lighting**: a `.blend` brings its own world and lights; a `.glb` is lit by `lighting.blend`, the template saved
  from the hand-made file (`make_lighting.py`: world, render-visible lights, camera, the size it was lit for). Its
  lights move and scale with each model (point lights' energy with the size²). `--camera-light <strength>` adds a sun
  along the camera's view.
- **Defaults**: `--faces 750` (QuadriFlow lands on its target; Quad Remesher at Kévin's 500 lands near 720–810, the
  hand-made density), `--subdivisions 3`, `--level 0`, `--size 1024`, `--samples 128`, voxel clean-up at the model's
  size / 110, `--padding 8` (bake margin: 8 px at the smallest map shipped – "Padding against seams").
  `--save-blend` keeps the working file (large: the high meshes and the HDRI).
- *face against face* through the batch: 686 + 719 quads, 2,810 triangles, 1.62 MB, 46 s – with `--one` also a single
  mesh with one map, 0.9 MB.

## Kévin's "Baking HD to LD" (2026-11-14) and the `kevin` preset

Kévin's own description: **join** all HD meshes into one (Ctrl+J); **Quad Remesher, target 2000 quads**, lowered until
the LD has **under 3,000 polygons**; Smart UV Project, island margin 0.01–0.02; a material with only an Image Texture
(**4096 × 4096**) into the Material Output, the node selected; select HD, then LD (active); bake **Combined**, Selected to
Active, **extrusion 0.2, max ray distance 0.25** (at his usual scale – scale them with the object), margin 16 px
Adjacent Faces; save the image as PNG; the colour straight into the output (unlit). Against seam lines: bake at 8K and
scale down to 4K, or soften the seams by hand (Texture Paint, Soften, bleed 16 px) or in Krita along the UV layout.
No Multiresolution/Shrinkwrap in this one.

`--preset kevin` sets exactly that (QuadriFlow instead of Quad Remesher; extrusion and ray scaled by model size / 6.93,
the size of *face against face*), except the margin: the batch's padding replaces the 16 px (128 px on an 8K bake with a
512 version; `--padding 1` gives Kévin's 16 px back). With *face against face*:

| | Quads | Triangles | GLB | Bake |
|---|---|---|---|---|
| Per object (the batch's default) | 686 + 719 | 2,810 | 1.62 MB (two 1024 PNG) | 18 s |
| `--preset kevin` | 1,780 | 3,560 | 12.9 MB (one 4096 PNG) | 104 s |
| `--preset kevin --supersample 2 --jpeg` (8K bake, scaled to 4K) | 1,780 | 3,560 | 0.98 MB | 427 s |

Close up, the 8K-to-4K bake is a little smoother than the plain 4K one; neither shows seam lines on this model.

**Texture sizes** (Tilman: the mesh once, the texture by the reader's quality setting – #260): `--texture-sizes
512,1024,2048,4096` writes the map at each size as JPEG 90, every one scaled down from the full bake, the 8K master PNG,
and `<name>_mesh.glb` with the 512 map embedded (*face against face*: mesh GLB 121 KB; maps 41 KB, 131 KB, 441 KB,
1.46 MB). For a model that is already baked, `texture_versions.py` does the same from its map (fight_2: mesh GLB
269 KB; maps 72 KB, 206 KB, 595 KB, 1.76 MB, against 14.3 MB for the GLB with its 4K PNG).

**Padding against seams** (2026-11-14). The black lines along UV islands are the empty map around them: texture
filtering and the reader's mipmaps sample past an island's edge. A downscaled map shrinks the bake margin with it – Kévin's
16 px on an 8K bake are 1 px in the 512 version. So the batch measures the margin at the smallest map it ships:
`--padding 8` (the default) is 8 px at 512, 128 px on the 8K bake (*Adjacent Faces*; Blender takes margins up to 32,767 px).
*face against face* from its `.blend`, `--preset kevin --supersample 2 --texture-sizes 512,1024,2048,4096`, once at the
old 16 px (`--padding 1`) and once at 128 px:

| | Empty map (8K master) | Maps 512 / 1024 / 2048 / 4096 | Mesh GLB |
|---|---|---|---|
| 16 px (before) | 44 % | 41 / 129 / 435 / 1,442 KB | 121 KB |
| 128 px (`--padding 8`) | 27 % | 48 / 156 / 536 / 1,776 KB | 125 KB |

Rendered with each map, every pixel that differs is darker in the 16 px version: the black edges and bands along the
islands are gone at 512, 1024 and 2048; the maps grow by 17–23 %. Further against seams, not automated: fewer, larger
UV islands with their seams in hidden places (a hand unwrap instead of Smart UV), and a larger island margin (at 0.015
two islands lie 8 px apart at 512, so each gets about 4 px of padding between them however large the bake margin).
`compare_maps.py` renders one mesh with each of its maps (close-up and full, unlit) to check this.

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
