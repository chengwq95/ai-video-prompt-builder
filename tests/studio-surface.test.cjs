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

test('every body type has its own bind shape without scaling posed bones', () => {
  const point = new THREE.Vector3(), seen = new Set();
  for (const body of Object.keys(M.BODY_TYPES)) {
    const p = M.bindPose(body);
    surface.update(M.skeleton(p), p); seen.add(surface.geometry);
    const raw = surface.geometry.getAttribute('position');
    for (let i = 0; i < surface.vertices; i++) {
      surface.body.getVertexPosition(i, point);
      assert.ok(point.distanceTo(new THREE.Vector3(raw.getX(i), raw.getY(i), raw.getZ(i))) < 1e-6, `${body}: bind mismatch at ${i}`);
      const n = surface.geometry.getAttribute('normal');
      assert.ok(Math.abs(Math.hypot(n.getX(i), n.getY(i), n.getZ(i)) - 1) < 0.02);
    }
    for (const bone of surface.skeleton.bones) assert.deepEqual(Array.from(bone.scale.toArray()), [1, 1, 1]);
  }
  assert.equal(seen.size, Object.keys(M.BODY_TYPES).length);
});

test('all body variants keep the hip stable when an arm is raised', () => {
  const point = new THREE.Vector3();
  for (const body of Object.keys(M.BODY_TYPES)) {
    const p = M.normalizePose({ body }), J = M.skeleton(p); surface.update(J, p);
    const samples = [];
    for (let i = 0; i < surface.vertices; i++) {
      surface.body.getVertexPosition(i, point);
      if (Math.abs(point.x) < 0.12 * J.scale && Math.abs(point.y - J.pelvis[1]) < 0.04 * J.scale) samples.push([i, point.clone()]);
    }
    assert.ok(samples.length > 50);
    const wave = M.normalizePose({ ...M.PRESETS.find(p => p.id === 'wave').pose, body });
    surface.update(M.skeleton(wave), wave);
    for (const [i, old] of samples) {
      surface.body.getVertexPosition(i, point);
      assert.ok(point.distanceTo(old) < 1e-5, `${body}: hip follows arm`);
    }
  }
});

test('switching body types restores the same mesh and pose without stale bind matrices', () => {
  const point = new THREE.Vector3(), baseline = new Map();
  for (const body of ['female', 'child', 'strong', 'slim', 'male', 'child', 'female']) {
    const p = M.normalizePose({ ...M.PRESETS.find(p => p.id === 'sit').pose, body, x: 0.8, z: -0.3 });
    surface.update(M.skeleton(p), p);
    const sample = Array.from({ length: 30 }, (_, i) => surface.body.getVertexPosition(i * 600, point).toArray());
    assert.ok(sample.flat().every(Number.isFinite));
    if (baseline.has(body)) assert.deepEqual(sample, baseline.get(body)); else baseline.set(body, sample);
  }
});

test('body and fingers have no open seams and use authored anatomical bone weights', () => {
  const edges = new Map(), index = surface.geometry.index.array;
  for (let i = 0; i < index.length; i += 3) for (const [a, b] of [[index[i], index[i + 1]], [index[i + 1], index[i + 2]], [index[i + 2], index[i]]]) {
    const key = Math.min(a, b) + ':' + Math.max(a, b); edges.set(key, (edges.get(key) || 0) + 1);
  }
  assert.ok([...edges.values()].every(n => n === 2));
  assert.ok(surface.skeleton.bones.some(b => b.name === 'rindex2'));
  assert.ok(surface.skeleton.bones.some(b => b.name === 'lClavicle'));
});

test('running, sitting, overhead and wide hip poses do not tear the joint surface', () => {
  const point = new THREE.Vector3(), positions = new Float32Array(surface.vertices * 3);
  const poses = ['run', 'sit', 'cheer'].map(id => M.PRESETS.find(p => p.id === id).pose);
  poses.push(M.P({ seated: true, lLeg: { a: 88, b: 60, c: 100 }, rLeg: { a: 88, b: 60, c: 100 }, lArm: { a: 85 }, rArm: { a: 85 } }));
  for (const body of Object.keys(M.BODY_TYPES)) for (const raw of poses) {
    const p = M.normalizePose({ ...raw, body }); surface.update(M.skeleton(p), p);
    for (let i = 0; i < surface.vertices; i++) {
      surface.body.getVertexPosition(i, point); assert.ok(Number.isFinite(point.lengthSq())); point.toArray(positions, i * 3);
    }
    const ids = surface.geometry.index.array, distance = (a, b) => Math.hypot(positions[a * 3] - positions[b * 3], positions[a * 3 + 1] - positions[b * 3 + 1], positions[a * 3 + 2] - positions[b * 3 + 2]);
    let longest = 0;
    for (let i = 0; i < ids.length; i += 3) longest = Math.max(longest, distance(ids[i], ids[i + 1]), distance(ids[i + 1], ids[i + 2]), distance(ids[i + 2], ids[i]));
    assert.ok(longest < 0.08, `${body}: torn joint edge ${longest}`);
  }
});

test('turning the palm does not pinch the elbow or collapse forearm cross-sections', () => {
  const point = new THREE.Vector3(), fractions = [0.05, 0.3, 0.5, 0.9];
  const cross = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  const halfHull = points => {
    const h = []; for (const p of points) { while (h.length > 1 && cross(h.at(-2), h.at(-1), p) <= 0) h.pop(); h.push(p); }
    h.pop(); return h;
  };
  function sections(body, twist, side) {
    const p = M.P({ body, lArm: { a: 25, c: 0, e: twist }, rArm: { a: 25, c: 0, e: twist } }), J = M.skeleton(p);
    surface.update(J, p);
    const R = J[side + 'ArmM'], inverse = [R[0], R[3], R[6], R[1], R[4], R[7], R[2], R[5], R[8]];
    const vertices = Array.from({ length: surface.vertices }, (_, i) => {
      surface.body.getVertexPosition(i, point); return M.mv(inverse, M.sub(point.toArray(), J[side + 'Elbow']));
    });
    const ids = surface.geometry.getAttribute('skinIndex'), weights = surface.geometry.getAttribute('skinWeight'), index = surface.geometry.index.array;
    const bones = new Set(surface.skeleton.bones.flatMap((b, i) => b.name.startsWith(side) && /^(Upper|Fore|Hand)/.test(b.name.slice(1)) ? [i] : []));
    const arm = vertices.map((_, i) => [0, 1, 2, 3].reduce((sum, c) => sum + (bones.has(ids.array[i * 4 + c]) ? weights.array[i * 4 + c] / 255 : 0), 0) > 0.7);
    return fractions.map(f => {
      const y = -M.measurements(body).fore * J.scale * f, intersections = [];
      for (let i = 0; i < index.length; i += 3) {
        const triangle = [index[i], index[i + 1], index[i + 2]]; if (!triangle.every(v => arm[v])) continue;
        for (let e = 0; e < 3; e++) {
          const a = vertices[triangle[e]], b = vertices[triangle[(e + 1) % 3]];
          if ((a[1] < y) === (b[1] < y)) continue;
          const t = (y - a[1]) / (b[1] - a[1]); intersections.push([a[0] + t * (b[0] - a[0]), a[2] + t * (b[2] - a[2])]);
        }
      }
      intersections.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
      const hull = [...halfHull(intersections), ...halfHull([...intersections].reverse())];
      assert.ok(hull.length > 8);
      return Math.abs(hull.reduce((sum, v, i) => { const next = hull[(i + 1) % hull.length]; return sum + v[0] * next[1] - v[1] * next[0]; }, 0)) / 2;
    });
  }
  for (const body of Object.keys(M.BODY_TYPES)) for (const side of ['l', 'r']) {
    const rest = sections(body, 0, side);
    for (const twist of [-90, 75, 90]) sections(body, twist, side).forEach((area, i) => {
      assert.ok(area / rest[i] > 0.92, `${body} ${side} at ${twist}: forearm ${fractions[i]} lost volume`);
      assert.ok(area / rest[i] < 1.04, `${body} ${side} at ${twist}: forearm swelled`);
    });
  }
});

test('the wrist has a continuous forearm-to-palm width instead of a pinched bind seam', () => {
  const point = new THREE.Vector3();
  for (const body of Object.keys(M.BODY_TYPES)) for (const side of ['l', 'r']) for (const twist of [0, 75, -90]) {
    const p = M.P({ body, lArm: { a: 25, c: 0, e: twist }, rArm: { a: 25, c: 0, e: twist } }), J = M.skeleton(p);
    surface.update(J, p);
    const R = J[side + 'HandM'], inverse = [R[0], R[3], R[6], R[1], R[4], R[7], R[2], R[5], R[8]];
    const vertices = Array.from({ length: surface.vertices }, (_, i) => {
      surface.body.getVertexPosition(i, point); return M.mul(M.mv(inverse, M.sub(point.toArray(), J[side + 'Wrist'])), 1 / J.handSize);
    });
    const ids = surface.geometry.getAttribute('skinIndex'), weights = surface.geometry.getAttribute('skinWeight'), index = surface.geometry.index.array;
    const bones = new Set(surface.skeleton.bones.flatMap((b, i) => b.name.startsWith(side) && /^(Fore|Hand)/.test(b.name.slice(1)) ? [i] : []));
    const valid = vertices.map((_, i) => [0, 1, 2, 3].reduce((sum, c) => sum + (bones.has(ids.array[i * 4 + c]) ? weights.array[i * 4 + c] / 255 : 0), 0) > 0.5);
    const sections = [0.02, 0.01, 0, -0.01, -0.02].map(y => {
      const intersections = [];
      for (let i = 0; i < index.length; i += 3) {
        const triangle = [index[i], index[i + 1], index[i + 2]]; if (!triangle.every(v => valid[v])) continue;
        for (let e = 0; e < 3; e++) {
          const a = vertices[triangle[e]], b = vertices[triangle[(e + 1) % 3]];
          if ((a[1] < y) === (b[1] < y)) continue;
          const t = (y - a[1]) / (b[1] - a[1]); intersections.push([a[0] + t * (b[0] - a[0]), a[2] + t * (b[2] - a[2])]);
        }
      }
      assert.ok(intersections.length > 20);
      return [0, 1].map(axis => Math.max(...intersections.map(p => p[axis])) - Math.min(...intersections.map(p => p[axis])));
    });
    const [width, depth] = sections[2], label = `${body} ${side} at ${twist}`;
    assert.ok(width > 0.05 && width < 0.075, `${label}: pinched or oversized wrist width ${width}`);
    assert.ok(depth > 0.032 && depth < 0.055, `${label}: pinched or oversized wrist depth ${depth}`);
    for (let i = 1; i < sections.length; i++) for (const axis of [0, 1]) {
      const ratio = sections[i][axis] / sections[i - 1][axis];
      assert.ok(ratio > 0.8 && ratio < 1.25, `${label}: abrupt wrist transition at ${i}`);
    }
  }
});
