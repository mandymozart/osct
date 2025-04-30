# OSCT

Kevin Bray for buildingfictions

## Live

https://osct.netlify.app 

[![Netlify Status](https://api.netlify.com/api/v1/badges/98de0d7b-4e71-4848-b987-6caa89675835/deploy-status)](https://app.netlify.com/sites/osct/deploys)

## Important Links for Team Croco

Penpot Design Files: https://design.penpot.app/#/workspace?team-id=0b127ab7-8934-814e-8005-baba96bbb70b&file-id=a0a8e792-b2d2-818e-8005-679037aa2fdf&page-id=a0a8e792-b2d2-818e-8005-679037aa2fe0 
Github issues: https://github.com/mandymozart/osct/issues
Schedule: https://docs.google.com/spreadsheets/d/196W4O6kJwT5QgPEqxZ3_-NDimJeyZ7vy-LfAj_vyhMc/edit?gid=0#gid=0 

## Technology

MindAR using tensoryflow, three, and aframe to display WebXR overlays.

Use MindAR compiler to generate image tracking targets.

### `cd client; npm run install`

Known issue: Use npm install --ignore-scripts if you want to build on windows with node version >22. or use 18. since there are canvas build scripts running which have issues with GTK3. So dlls are missing. works fine on netlify inside a docker.

alternatively use this for a more permanent solution:

```
"canvas": {
  "skip-install": true
}
```
