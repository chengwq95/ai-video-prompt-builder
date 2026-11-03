# Body geometry generator

Run `node tools/build-body.cjs` after changing the procedural anatomy in `studio-surface.js`.

The generator writes `studio-body-data.js` so the webpage can load the smooth body without generating it at startup.
