Three.js 0.187.0, MIT license (see THREE-LICENSE.txt).

`three.min.js` is a local browser IIFE of the official npm package's
`build/three.module.js` and the official `MarchingCubes` addon, bundled with esbuild 0.25.12:

```
// entry.js:
export * from 'three';
export { MarchingCubes } from 'three/addons/objects/MarchingCubes.js';

// bundle:
esbuild entry.js --bundle --minify --format=iife --global-name=THREE --legal-comments=inline --outfile=vendor/three.min.js
```

The studio needs no CDN, model download, runtime package installation or build step.
The character is original procedural geometry, with no external model or texture assets.
