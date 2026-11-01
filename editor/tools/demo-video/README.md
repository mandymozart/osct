# The editor's demo video (#195)

A ~30 s work-in-progress video of the editor with the demo book, in two formats from the same scenes: **9:16**
(1080 × 1920, the phone layout – an Instagram reel) and **16:9** (1920 × 1080, the desktop layout – e-mail, WhatsApp).
Real UI, real demo content, **no text** (Tilman: *"Kein Text."* – no titles, no end card), no audio track. The files
are sent by Tilman himself; these scripts never upload anything.

| Script | What it does |
| --- | --- |
| `prepare.mjs` | Signs in on a local API with a code from its mail log, imports a published content version (configuration + `files.json`, so the Library has the import's files); `--sign-out` ends the session and deletes the token file |
| `record.mjs` | Starts its own headless Edge, sets each scene up off camera (page, stored view, tab, sheet height), records it with `Page.startScreencast` while scripted input (mouse / touch, eased moves) plays it; frames + timestamps per scene |
| `cut.mjs` | The cut (its `PLAN`: order and trims): frames → constant 30 fps by their timestamps, 7-frame crossfades, a 0.4 s fade out, H.264 (High, yuv420p, `+faststart`, no audio) |
| `cdp.mjs` | The small CDP client the others use (no packages, Node 22) |

## Re-recording

1. **A copy of a local SQLite** (never the main one) and an API on a free port, with its own config file
   (`OSCT_CONFIG_FILE`: `DB_SQLITE_PATH` to the copy, a `SECRET`, `MAIL_TRANSPORT => 'log'` with `MAIL_LOG_PATH`,
   the editor's origin in `ALLOWED_ORIGINS`), migrated (`POST /api/admin/migrate` with the secret):
   `php -S 127.0.0.1:8091 -t server server/api/index.php` from the checkout.
2. The editor's dev server against it: `OSCT_API_PROXY=http://127.0.0.1:8091 npx vite dev --port 5187 --strictPort --host 127.0.0.1` in `editor/`.
3. Sign in and import the demo (the address is the copy's editor account; the token file stays outside the repo):
   ```bash
   node prepare.mjs --api http://127.0.0.1:8091/api --email <editor address> --mail-log <copy's mail.log> \
     --token-file <temp>/token.txt --book demo --content https://buildingfictions.b-cdn.net/demo/<build>
   ```
4. Record each format (Edge on `--port`, default 9341; frames into `<rec>/<format>/<scene>/`):
   ```bash
   node record.mjs --format desktop --out <rec> --token-file <temp>/token.txt --editor http://127.0.0.1:5187/editor
   node record.mjs --format phone   --out <rec> --token-file <temp>/token.txt --editor http://127.0.0.1:5187/editor
   ```
   `--scenes a,b` re-records some (`--no-warm` skips filling the cache). **Import again before each format**: the
   `code` scene's *make it code* saves a plugin into the draft.
5. Cut: `node cut.mjs --format desktop --in <rec> --out <out>/osct-wip-16x9.mp4` and `--format phone … osct-wip-9x16.mp4`
   (`--crf`, default 17, and `--maxrate`, default 3.6M, keep each file under WhatsApp's 16 MB).
6. Watch the result (frames every 1.5 s with ffmpeg), then `node prepare.mjs --api … --token-file … --sign-out`,
   stop the servers and delete the frames.

## What the recording changes, what it hides

- Recording-only CSS hides the account's address in the top bar and the AI connections (tokens) on the books page,
  and Android's blue tap highlight (the emulated phone flashes it over every tapped link). Nothing else is touched.
- No cursor: a subtle dot follows the pointer or finger during drags only.
- The scenes' coordinates on the stage (the gizmo's handles, the aquarium, the key) are for the stored orbit of each
  scene and the format's viewport (1440 × 810 CSS px at 4/3; 390 × 693 at 1080/390) – a changed default view, desk or
  demo layout moves them.
- *Make it code* runs on the key's model, not on the aquarium: on the aquarium's tank the generated code leaves the
  tank empty on the stage (`agents/MEMORY.md`, 2026-10-30, the demo video's open items).
- Dragging the phone's sheet **down** shows black under the stage until the canvas resizes on release, so the phone's
  scenes only drag it up.
