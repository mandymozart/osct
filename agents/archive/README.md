# agents/archive – closed history

Moved here on 2026-11-20 (#31, Tilman: "Sortieren nach dem Plan mit Archive") so that `agents/PLAN.md` and
`agents/MEMORY.md`, which every session reads first, stay short and current. **Nothing was deleted or reworded**:
the text of every moved entry is verbatim.

| File | What is in it |
|---|---|
| `PLAN-done.md` | Phases 0–6 and 12 of the restructuring plan (built; Phase 12 superseded by Phase 13) |
| `MEMORY-2026-09.md` | dated decisions of September 2026 (newest first, as in the original) |
| `MEMORY-2026-10.md` | dated decisions of October 2026 |

This is history, not the current state. Do not read it up front and do not edit it (apart from ticking an
item that `MEMORY.md` / `PLAN.md` also carries, if it is resolved).

- Open `[ ]` items of the archived text are copied verbatim into `MEMORY.md` ("Open items in the archive") and
  `PLAN.md` ("Open items of the built phases"); tick them there.
- `MEMORY.md` ends with an index of every archived entry (date, title, archive file).
- Search: `grep -rn "<term>" agents/archive/` (add `-i`), or open the month file named in the index.
- New dated decisions go on top of `MEMORY.md` as before; when a month is over and its entries are done, move
  them into a new `MEMORY-<year>-<month>.md` here.
