# AR Book Application

This repository contains the configuration and content for an AR-enabled book application. The system uses a modular approach to manage chapters and AR targets.

## Content Structure

Organize your content in a modular folder structure:

```
content/
├── chapters/
│   ├── chapter1/
│   │   └── chapter.md
│   ├── chapter2/
│   │   └── chapter.md
│   └── chapter3/
│       └── chapter.md
├── steps/
│   ├── step-1/
│   │   └── step.md
│   ├── step-2/
│   │   └── step.md
│   ├── step-3/
│   │   └── step.md
│   ├── step-4/
│   │   └── step.md
│   ├── step-5/
│   │   └── step.md
│   └── step-6/
│       └── step.md
└── targets/
    ├── target-001/
    │   ├── target.md
    │   ├── image.jpg
    │   └── model.glb
    ├── target-002/
    │   ├── target.md
    │   ├── image.jpg
    │   └── texture.png
    └── target-003/
        ├── target.md
        ├── image.jpg
        └── video.mp4
```

## File Formats

### Chapter Files (`chapter.yaml`)

Each chapter is defined by a markdown file with YAML frontmatter:

```yaml
id: chapter1
order: 0
title: The Beginning
firstPage: 1
lastPage: 3
imageTargetSrc: /targets/single-image.mind
```

### Target Files (`target.yaml`)

Each AR target is defined by a markdown file with YAML frontmatter:

```yaml
id: target-001
chapterId: chapter1
mindarTargetIndex: 0
bookId: "001"
title: Bear
description: A curious bear appears in the woods.
type: model
assetId: bear
assetType: gltf
assetSrc: models/bear.gltf
relatedTargets: target-002,target-003
tags: forest,animal
```

### Target Type Options

- `model`: 3D model (glTF/GLB)
- `video`: Video file (MP4/WebM)
- `link`: External URL link with optional billboard image
- `basic`: Simple target with metadata only

## Configuration Generation

Use the provided script to generate the game.config.json file:

```bash
npm run build:config
```

This will scan the chapters and targets directories and create a properly formatted game.config.json file for the application.

## Tutorial Content

The tutorial content is defined in the build script. If you need to modify the tutorial steps, edit the `buildConfig.js` file.

## Asset Guidelines

- **3D Models**: Use glTF/GLB format with embedded textures. The first animation will be automatically played in a loop.
- **Videos**: Use MP4 or WebM formats with appropriate compression.
- **Images**: Use high-quality images for target recognition.

## Development

1. Create your chapter folders and files in `content/chapters/`
2. Create your target folders and files in `content/targets/`
3. Run `npm run build:config` to generate the game.config.json file
4. Test your application with the generated configuration