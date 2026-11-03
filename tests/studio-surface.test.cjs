const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const context = vm.createContext({ console, atob });
for (const file of ['vendor/three.min.js', 'studio-model.js', 'studio-body-data.js', 'studio-surface.js']) vm.runInContext(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), context);
const { M, THREE, surface } = vm.runInContext('({ M: CamPoseModel, THREE, surface: StudioSurface.create(CamPoseModel, new THREE.MeshStandardMaterial(), new THREE.Group()) })', context);

test('the body is one connected, detailed, shared-vertex surface', () => {
  const geo = surface.geometry, positions = geo.getAttribute('position');
  assert.ok(positions.count > 15000); assert.ok(geo.index.count / 3 > 30000);
  const parents = Uint32Array.from({ length: positions.count }, (_, i) => i);
  const find = x => { while (parents[x] !== x) { parents[x] = parents[parents[x]]; x = parents[x]; } return x; };
  for (let i = 0; i < geo.index.count; i += 3) {
    const a = find(geo.index.array[i]), b = find(geo.index.array[i + 1]), c = find(geo.index.array[i + 2]); parents[b] = a; parents[c] = a;
  }
  assert.equal(new Set(Array.from(parents, (_, i) => find(i))).size, 1);
});

test('surface normals and four-bone weights remain finite and normalized', () => {
  const geo = surface.geometry, normals = geo.getAttribute('normal'), weights = geo.getAttribute('skinWeight'), ids = geo.getAttribute('skinIndex');
  for (let i = 0; i < normals.count; i++) {
    const length = Math.hypot(normals.getX(i), normals.getY(i), normals.getZ(i));
    assert.ok(Math.abs(length - 1) < 0.02);
    const sum = weights.getX(i) + weights.getY(i) + weights.getZ(i) + weights.getW(i);
    assert.ok(Math.abs(sum - 1) < 1e-6);
    for (const id of [ids.getX(i), ids.getY(i), ids.getZ(i), ids.getW(i)]) assert.ok(id >= 0 && id < surface.skeleton.bones.length);
  }
});

test('raising an arm does not pull the hip or the root of the thigh outwards', () => {
  const standing = M.skeleton(M.BASE()); surface.update(standing, M.BASE());
  const samples = [], position = new THREE.Vector3();
  for (let i = 0; i < surface.vertices; i++) {
    surface.body.getVertexPosition(i, position);
    if (Math.abs(position.x) < 0.17 && position.y > standing.pelvis[1] - 0.08 && position.y < standing.pelvis[1] + 0.06) samples.push([i, position.clone()]);
  }
  assert.ok(samples.length > 100);
  const pose = M.normalizePose(M.PRESETS.find(p => p.id === 'wave').pose); surface.update(M.skeleton(pose), pose);
  for (const [i, old] of samples) {
    surface.body.getVertexPosition(i, position);
    assert.ok(position.distanceTo(old) < 0.0001, `Hip vertex ${i} moved with the arm`);
  }
});
