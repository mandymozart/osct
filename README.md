# OSCT

Kevin Bray for buildingfictions

## Live

https://osct.glitch.me/

https://osct.netlify.app 

[![Netlify Status](https://api.netlify.com/api/v1/badges/98de0d7b-4e71-4848-b987-6caa89675835/deploy-status)](https://app.netlify.com/sites/osct/deploys)

## Technology

MindAR using tensoryflow, three, and aframe to display WebXR overlays.

Use MindAR compiler to generate image tracking targets.

### `npm run install`

Known issue: Use npm install --ignore-scripts if you want to build on windows with node version >22. or use 18. since there are canvas build scripts running which have issues with GTK3. So dlls are missing. works fine on netlify inside a docker.

alternatively use this for a more permanent solution:

```
"canvas": {
  "skip-install": true
}
```
