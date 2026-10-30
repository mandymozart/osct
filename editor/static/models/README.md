# Models of the editor's stage

The desks the Stage panel offers (`desk` in `editor/src/lib/stage/preview.ts`, drawn by `mock-stage.ts`), 1.8 × 0.8 m
tops – our own low-poly models, both built by `editor/tools/desk-eiermann.py` (Blender, headless):

| File | What | Source |
|---|---|---|
| `desk-eiermann.glb` | A screen-printed plywood top (18 mm) on a steel tube frame after Egon Eiermann's table frame (Tischgestell 1, 1953), 72 cm high – 236 triangles | Our own model; the frame's tube axes were measured from a 3ds Max model of the frame Tilman supplied (`01_E1_1100x660-exzentrisch`), which carries no licence and is not in the repository |
| `desk-schoepfer.glb` | Philipp Camille Schöpfer's desk, 75 cm high: a thin sandwich top (24 mm – linoleum over an aluminium core, an oak edge band all round), three open oak drawers hanging under its front edge, a black powder-coated steel frame (a flat rim, at each end two square legs splayed in a narrow A, each with a strut up to the rim's end) – 256 triangles | Our own model after the manufacturer's catalogue photographs (#187; the images are the manufacturer's and not in the repository) |

The files carry no textures. Each model's origin is the centre of the top's upper surface. The stage puts its own look
on the Eiermann's `top` (Poly Haven's plywood tinted to the phenolic brown) and `edge` (the board's cut sides: the
plywood's plies, drawn in code by `editor/src/lib/stage/plywood.ts`), and on Schöpfer's `linoleum` and `oak` (drawn in
code by `linoleum.ts` and `oak.ts`); it leaves `steel` (the frames), `aluminium` (Schöpfer's underside) and `drawer`
(the drawers' dark inside) as exported. `steel` is powder-coated, not bare metal (metallic at most 0.5, rough): a metal
shows almost only what it reflects, so thin dark tubes vanish before a dark studio and under the scene's own lights
(textured shading). Schöpfer's is black and matt, with a low specular level (`KHR_materials_specular`), so the studio
HDRIs' bright lights don't wash its flat faces out. It stays double-sided – the Eiermann's tubes are open, their
insides show at the ends. `src/lib/stage/__tests__/desk-models.test.ts` checks both files.

UVs: the Eiermann's edges run u along the edge (a repeat every 250 mm) and v through the thickness, one stack of plies.
Schöpfer's oak runs u along the grain – the longer side of each face, so along the edge band and along each drawer wall
(a repeat every 500 mm) – and v across it (125 mm); the linoleum repeats every 400 mm both ways. Regenerate both with

```bash
"C:/Program Files/Blender Foundation/Blender 5.1/blender.exe" -b -P editor/tools/desk-eiermann.py
```
