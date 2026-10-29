# Models of the editor's stage

The desks the Stage panel offers (`desk` in `editor/src/lib/stage/preview.ts`, drawn by `mock-stage.ts`), 1.8 × 0.8 m
tops, 72 cm high – our own low-poly models, both built by `editor/tools/desk-eiermann.py` (Blender, headless):

| File | What | Source |
|---|---|---|
| `desk-eiermann.glb` | A screen-printed plywood top (18 mm) on a steel tube frame after Egon Eiermann's table frame (Tischgestell 1, 1953) – 236 triangles | Our own model; the frame's tube axes were measured from a 3ds Max model of the frame Tilman supplied (`01_E1_1100x660-exzentrisch`), which carries no licence and is not in the repository |
| `desk-schoepfer.glb` | A thick white top (60 mm) with three drawer cutouts in its front edge on four slender white steel legs splayed outward, after Philipp Camille Schöpfer's desk – 124 triangles | Our own model after a photograph of the desk |

The files carry no textures. Each model's origin is the centre of the top's upper surface; the stage puts its own
look on the material `top` (Poly Haven's plywood tinted to the phenolic brown for the Eiermann top, white for
Schöpfer's) and on `edge` (the Eiermann top's cut edges: the plies along the edge) and leaves `steel` (the frame) and
`drawer` (the inside of the cutouts) as exported. Regenerate both with

```bash
"C:/Program Files/Blender Foundation/Blender 5.1/blender.exe" -b -P editor/tools/desk-eiermann.py
```
