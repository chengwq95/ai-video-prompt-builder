# Anatomical drawing mesh

The base mesh, body-shape targets, default skeleton joint landmarks and authored vertex weights are CC0 assets from [MakeHuman](https://github.com/makehumancommunity/makehuman), pinned to revision `a8bc2d54ff0ac92e78ff71431b1023eda42bf482`.

MakeHuman's [asset license](https://www.makehumancommunity.org/about/license.html) covers these graphical assets as CC0. The full included license is in `HUMAN-ASSETS-LICENSE.md`. No MakeHuman application source code is copied or required.

`studio-body-data.js` contains the derived mesh and weights, not runtime network dependencies. The build uses the body group only (no helper objects), averages the three core ethnicity targets for each selected age/sex, applies the muscle/weight targets for the build variants, retargets to the editor's joint frames, simplifies small surface details for a neutral drawing mannequin, and subdivides the anatomical edge loops once. Hands are part of the same surface and use the original finger weights.

Source paths and SHA-256 checksums are recorded in `tools/human-assets-manifest.json`. The importer and pose/hand/prop logic are project code. See `tools/README.md` for regeneration.
