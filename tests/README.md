# Regression checks

Run `node --test tests/*.test.cjs` from the repository root.

Checks cover continuous camera dragging, framing transitions, camera directions, pose controls, saved state, and smooth body geometry.

Body checks also cover type-specific bind shapes, neutral bone scales, child proportions, arm/hip isolation for every build, repeatable body switching, and reaching with either model position.

Anatomy/grip checks cover closed body-and-finger topology; running, sitting, overhead and wide hip poses; upright cups; wrist-relative prop attachment; finger contact; pair spacing; and one-time legacy grip migration.

Forearm rotation checks measure actual mesh cross-sections near the elbow, through the muscle belly and near the wrist. All five builds and both arms must retain at least 92% of their untwisted section area at -90°, 75° and 90° without swelling.

Wrist checks measure width and depth across five sections through the forearm-to-palm seam, for every build and both sides. A straight wrist must retain a natural width and thickness, with no sudden neck at the joint. Manual browser regression: reload, open Pose → Joints directly, and verify the anatomical picker appears before clicking a joint or changing an angle.

`studio-collision.test.cjs` independently checks posed skin samples against the actual body triangles, object faces, seats and furniture legs, and verifies actual sole vertices stay above the floor. The connected shoulder attachment is excluded from self-contact tests; a 4 mm tolerance allows skin contact and quantized geometry. The usual suite covers the reported phone, hands-on-hips, running-to-sitting and chair cases for all five builds (40 combinations).

Run the complete 675-combination matrix after changing collision or seating logic:

```
STUDIO_FULL_AUDIT=1 node --test tests/studio-collision.test.cjs
```

This covers 13 presets × five handheld states × two sitting-toggle paths × five builds, plus 25 chair cases. Manual browser checks also cover opening the joint map directly after reload, phone-at-ear and hands-on-hips from multiple views, running → Sitting, both models, preview open/closed, PNG export, and the wide/narrow layout.
