<p align="center">
  <img src="docs/assets/mark.png" alt="Mark the Page" width="220">
</p>

# Onion Skin & Crocodile Tears

Web AR companion app for Kévin Bray's book (buildingfictions). Scan the pages, unlock the entries.

## Quick start

Node 22.

```bash
cd scripts && npm install && npm run build && npm run build:content
cd ../client && npm install && npm run dev
```

Open http://localhost:5173.

Changed something in `content/`? Run `npm run build:content` in `scripts/` again and commit the result.

## More

- [Documentation](docs/README.md) – content authoring, build, deploy, architecture
- Working on the code: [CLAUDE.md](CLAUDE.md) → `agents/`
