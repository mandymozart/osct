# Configuration Generation

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