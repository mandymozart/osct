# Structure

This repository organizes content for the AR-enabled book application using a modular YAML-based configuration system. The content is organized into chapters, targets, and tutorial steps.

## Directory Structure

```
content/
├── chapters/                # Chapter definitions
│   ├── chapter1/
│   │   ├── chapter.yaml     # Chapter metadata
│   │   └── chapter1.mind    # MindAR data file for chapter
│   ├── chapter2/
│   │   ├── chapter.yaml
│   │   └── chapter2.mind
│   └── chapter3/
│       ├── chapter.yaml
│       └── chapter3.mind
│
├── targets/                 # AR target definitions
│   ├── target-001/
│   │   ├── target.yaml      # Target metadata
│   │   ├── images-028.jpg   # Image for target recognition
│   │   ├── images-028.mind  # MindAR data for specific target
│   │   ├── racoon.glb       # 3D model asset
│   │   └── racoon.asset.yaml # Asset metadata
│   ├── target-002/
│   │   ├── target.yaml
│   │   ├── images-102.jpg
│   │   ├── images-102.mind
│   │   ├── tree.glb
│   │   └── tree.asset.yaml
│   └── ...
│
└── steps/                  # Tutorial steps
    ├── step-1/
    │   └── step.yaml       # Step metadata
    ├── step-2/
    │   └── step.yaml
    └── ...
```

## Configuration File Formats

### Chapter Configuration (chapter.yaml)

```yaml
type: chapter
id: chapter1                # Unique chapter identifier
order: 0                    # Order in the book
title: The Beginning        # Chapter title
firstPage: 1                # First page number
lastPage: 3                 # Last page number
mindSrc: chapter1.mind      # MindAR data file
```

### Target Configuration (target.yaml)

```yaml
id: target-001              # Unique target identifier
type: target                # Type must be 'target'
title: Racoon               # Display title
description: A beast, a friend, a dimension jumper.
relatedChapter: chapter1    # Which chapter this target belongs to
order: 1                    # Order within the chapter
hideFromIndex: false        # (optional) (DEFAULT: false) hides target from index
bookId: "001"               # Book reference ID
entityType: model           # Type of AR experience (model, video, image, link)
imageTargetSrc: images-028.jpg  # Source image for recognition
mindSrc: images-028.mind    # MindAR data for this target
assets: racoon              # Referenced asset ID(s)
relatedTargets: target-002  # Related targets (for navigation)
tags: forest,animal         # Categorization tags
```

### Asset Configuration (*.asset.yaml)

```yaml
type: asset                # Type must be 'asset'
id: racoon                 # Unique asset identifier
assetType: glb             # Asset type (REQUIRED - glb, image, video, audio, link)
src: racoon.glb            # Asset source file
```

## Important Notes

1. **assetType Field**: All assets **must** include the `assetType` field which determines how the asset will be processed:
   - `glb` or `gltf`: 3D models
   - `image`: Static images
   - `video`: Video content
   - `audio`: Audio content
   - `link`: External URL links

2. **Asset References**: Assets are referenced by their ID in the target.yaml file

3. **Mind Files**: Each target requires both an image file for visual recognition and a .mind file which contains the MindAR tracking data

4. **Related Targets**: Use the relatedTargets field to create connections between different AR experiences

The build script will process these YAML files to generate the final game.config.json that powers the application.

