# Anatomical mesh compiler

The website loads the generated `studio-body-data.js`; it needs no network, package installation or build step at runtime.

To fetch the pinned CC0 MakeHuman assets and rebuild:

```
node tools/build-body.cjs --download
```

To rebuild from an existing source folder containing the files named in `human-assets-manifest.json`:

```
node tools/build-body.cjs --source-dir=/absolute/path/to/human-source
```

The compiler uses only Node built-ins. It retains the authored body/finger weights, remaps joints to `CamPoseModel.skinFrames`, retargets each shape to the editor's bind pose, adds tapered arm fullness, and subdivides the anatomical quad loops once. Forearm weights are distributed between adjacent twist frames so palm rotation does not pinch the elbow. The result is a closed connected mesh with 53,514 vertices, 107,024 triangles and 56 bones. Mesh variants, topology and quantized four-bone weights are bundled locally.

The revision and source hashes are pinned in `human-assets-manifest.json`. Source licenses and provenance are in `vendor/HUMAN-ASSETS.md`. After changing joint frames or finger rest dimensions, rebuild the data and run `node --test tests/*.test.cjs`. Body-data format changes must also update the asset version query in `index.html` so browsers load matching files.

The source forearm and palm use different transverse axes. The importer smoothly aligns the forearm frame to the palm before blending their authored wrist weights, preventing opposite offsets from cancelling into a narrow wrist seam. This changes the wrist connection without resizing the palm or fingers.

`CamPoseModel.bindPose` marks the fixed reference pose so runtime sole-based grounding cannot change its bind matrices. Collision profiles and surface samples are derived once from the bundled data; runtime poses can then be grounded and constrained without rebuilding or changing the reference geometry.
