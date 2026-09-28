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

Open https://localhost:5173 (on a phone: `https://<your-ip>:5173`, accept the self-signed certificate once –
the camera only works over https).

## Content

The book's content lives in `content/` (text files + media) – see the [content guide](docs/content.md).
The app doesn't read `content/` directly: the content build turns it into the app's configuration.
Run it after every change:

```bash
cd scripts
npm run build:content          # checks all files, writes client/src/game.config.json + copies the media
npm run build:content:force    # same, even when nothing changed
```

- It stops with a message naming the file and the problem when something is wrong.
- Commit the changed `content/`, `client/src/game.config.json` and `client/public/assets/content`
  together – the checks on GitHub fail if they don't match.
- The dev server picks up the new content on reload.

## Image tracking

The app recognises the book's pages with the open source image tracking engine of
[8th Wall](https://github.com/8thwall/8thwall) by Niantic Spatial – the former commercial 8th Wall platform,
discontinued and released under the MIT licence (npm `@8thwall/engine`). Its licence ships with the app
next to the engine files (`assets/xr8/LICENSE`).

## More

- [Documentation](docs/README.md) – content, build, deploy, architecture
- Working on the code: [CLAUDE.md](CLAUDE.md) → `agents/`
