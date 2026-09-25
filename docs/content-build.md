# Content build

`scripts/` turns `content/` into what the app loads:

- `client/src/game.config.json` – the game configuration (book, spreads, targets, entries, tutorial,
  version)
- `client/public/assets/content/` – a copy of the content media
- `mind-ar/<spread>/` – target images in MindAR order, for [compiling `.mind` files](content.md#compiling-mind-files)

```bash
cd scripts
npm install
npm run build                 # type-check + bundle the build tool (after changing scripts/src)
npm run build:content         # build the content
npm run build:content:force   # rebuild even if nothing changed
```

(`cd client && npm run build:config` runs `build:content` as well.)

## What the build checks

The build stops without writing anything when a file is invalid:

- required fields, types and allowed values (`category`, entity `type`, step `action`)
- spreads don't overlap, every entry page lies in a spread, max 5 targets per spread
- referenced files and shared entities exist
- the result matches the game configuration contract (`shared/`) – the app runs the same check on load

## Version and hash

`version.version` is the app version (`client/package.json`, same as `scripts/package.json`).
`version.hash` is a checksum of all inputs – `content/`, `shared/`, `scripts/src` and the version.
When the hash is unchanged the build skips.

Commit the regenerated `game.config.json` and `client/public/assets/content`: CI rebuilds the
content and fails when the committed files differ.

## Contract

The shape of `game.config.json` is defined once in `shared/types/game-config.ts` (entry categories
in `shared/types/entry.ts`), with runtime guards in `shared/guards/`. In the app only
`client/src/utils/game-config.ts` reads the file.
