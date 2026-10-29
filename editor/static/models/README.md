# Models of the editor's stage

| File | What | Source |
|---|---|---|
| `desk-eiermann.glb` | The stage's desk: a 1.4 × 1.0 m screen-printed plywood top (18 mm) on a steel tube frame after Egon Eiermann's table frame (Tischgestell 1, 1953), 72 cm high | Our own low-poly model, built by `editor/tools/desk-eiermann.py` (Blender, headless); the frame's measurements were taken from a 3ds Max model of the frame Tilman supplied, which is not in the repository |

The GLB carries no textures: the stage (`editor/src/lib/stage/mock-stage.ts`) puts Poly Haven's plywood on the
materials `top` (tinted to the phenolic brown) and `edge` (the plies along the cut edges) and leaves `steel` as
exported. Regenerate it with

```bash
"C:/Program Files/Blender Foundation/Blender 5.1/blender.exe" -b -P editor/tools/desk-eiermann.py
```
