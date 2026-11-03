const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const M = vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../studio-model.js'), 'utf8') + ';CamPoseModel');
const J = M.skeleton(M.BASE());
const chest = M.cameraTarget(M.normalizeCamera({ focus: 'chest' }), J);
const project = M.makeView([-2.5, 2.3, 5.3], chest, 36, 900, 500).project;
const near = (a, b, tolerance = 1e-7) => assert.ok(Math.abs(a - b) < tolerance, `${a} != ${b}`);
const angularDifference = (a, b) => ((a - b + 540) % 360) - 180;

test('the default camera aims at the upper chest, well above the pelvis', () => {
  const camera = M.normalizeCamera(), target = M.cameraTarget(camera, J);
  assert.equal(camera.focus, 'chest');
  assert.ok(target[1] > J.pelvis[1] + 0.3);
  assert.ok(target[1] < J.neck[1]);
});

test('the yellow camera position is exactly the preview camera position at all distances', () => {
  for (const focus of ['head', 'chest', 'whole']) for (const distance of [0.2, 0.6, 1, 1.1, 1.4, 2.8, 8]) for (const az of [0, 90, 180, 270]) {
    const camera = M.constrainCamera({ az, el: -25, distance, focus }, J), spec = M.shotCamera(camera, J);
    const yellow = M.cameraControlPoint(camera, 'distance', spec.target);
    near(Math.hypot(...M.sub(yellow, spec.pos)), 0);
    near(Math.hypot(...M.sub(spec.pos, spec.target)), distance);
    near(spec.fov, M.CAMERA.fov);
    assert.ok(spec.pos[1] >= M.CAMERA.floor - 1e-7);
  }
});

test('the yellow camera can pass through and closer than the pink reference arc', () => {
  const camera = M.normalizeCamera({ az: 45, el: 10, focus: 'chest', distance: 0.2 });
  const yellow = M.cameraControlPoint(camera, 'distance', chest), pink = M.cameraControlPoint(camera, 'el', chest);
  near(Math.hypot(...M.sub(yellow, chest)), 0.2);
  near(Math.hypot(...M.sub(pink, chest)), M.CAMERA.guideRadius);
  assert.ok(Math.hypot(...M.sub(yellow, chest)) < Math.hypot(...M.sub(pink, chest)));
});

test('advancing through the pink arc follows the pointer all the way to 0.20 metres', () => {
  const camera = M.normalizeCamera({ az: 108, el: 20, distance: 2.8, focus: 'chest' });
  for (let i = 280; i >= 20; i--) {
    const expected = i / 100, pointer = project(M.cameraControlPoint({ ...camera, distance: expected }, 'distance', chest));
    camera.distance = M.dragCameraControl(camera, 'distance', pointer, project, chest);
    assert.ok(Math.abs(camera.distance - expected) < 0.005, `${camera.distance} did not follow ${expected}`);
  }
  assert.ok(camera.distance < 0.205);
});

test('changing distance never moves the chosen look-at target or changes the lens', () => {
  for (const focus of ['head', 'chest', 'whole']) {
    let target;
    for (let i = 20; i <= 800; i += 5) {
      const shot = M.shotCamera({ az: 45, el: 10, distance: i / 100, focus }, J);
      if (target) near(Math.hypot(...M.sub(target, shot.target)), 0);
      target = shot.target; near(shot.fov, 45);
    }
  }
});

test('a stationary grabbed control keeps its value even at projected ring folds', () => {
  for (let az = 0; az < 360; az += 3) for (const id of ['az', 'el', 'distance']) {
    const camera = M.normalizeCamera({ az, el: 19, distance: 1.03 });
    const pixel = project(M.cameraControlPoint(camera, id, chest));
    const value = M.dragCameraControl(camera, id, pixel, project, chest);
    near(id === 'az' ? angularDifference(value, camera[id]) : value - camera[id], 0);
  }
});

test('small angle drags remain on the nearby branch of the orbit ring', () => {
  for (let az = 0; az < 360; az += 5) {
    const camera = M.normalizeCamera({ az, el: 19, distance: 2 });
    const pixel = project(M.cameraControlPoint(camera, 'az', chest)), pointer = { x: pixel.x + 2, y: pixel.y + 1 };
    const value = M.dragCameraControl(camera, 'az', pointer, project, chest);
    assert.ok(Math.abs(angularDifference(value, az)) <= 25.001);
    const moved = project(M.cameraControlPoint({ ...camera, az: value }, 'az', chest));
    assert.ok(Math.hypot(moved.x - pointer.x, moved.y - pointer.y) <= Math.sqrt(5) + 0.001);
  }
});

test('head focus follows head posing rather than the pelvis', () => {
  const pose = M.BASE(); pose.headYaw = 50; pose.headPitch = 20;
  const posed = M.skeleton(pose), target = M.cameraTarget({ focus: 'head' }, posed);
  assert.ok(Math.hypot(...M.sub(target, posed.head)) < 0.1);
  assert.ok(target[1] > posed.chest[1]);
  assert.ok(Math.hypot(...M.sub(target, M.cameraTarget({ focus: 'head' }, J))) > 0.02);
});

test('full-body framing is an explicit action and fits different poses and aspect ratios', () => {
  for (const id of ['stand', 'cheer', 'sit', 'run']) for (const aspect of [9 / 16, 1, 16 / 9]) for (const el of [-25, 0, 40, 75]) {
    const pose = M.normalizePose(M.PRESETS.find(p => p.id === id).pose), joints = M.skeleton(pose), bounds = M.cameraBounds(joints);
    const camera = M.normalizeCamera({ az: 45, el, focus: 'whole' });
    camera.distance = M.fitCameraDistance(camera, joints, aspect, bounds);
    const shot = M.shotCamera(camera, joints), view = M.makeView(shot.pos, shot.target, shot.fov, 100 * aspect, 100);
    for (const x of [bounds.min[0], bounds.max[0]]) for (const y of [bounds.min[1], bounds.max[1]]) for (const z of [bounds.min[2], bounds.max[2]]) {
      const p = view.project([x, y, z]);
      assert.ok(p && p.x >= 0 && p.x <= 100 * aspect && p.y >= 0 && p.y <= 100, JSON.stringify({ id, aspect, el, camera, p }));
    }
    assert.ok(shot.target[1] > joints.pelvis[1] + 0.2);
  }
});

test('low shots preserve the actual distance and report the ground-constrained elevation', () => {
  for (const distance of [0.2, 0.5, 1, 2, 4, 8]) {
    const shot = M.shotCamera({ az: 0, el: -60, distance, focus: 'chest' }, J);
    near(Math.hypot(...M.sub(shot.pos, shot.target)), distance);
    near(M.norm(M.sub(shot.pos, shot.target))[1], Math.sin(shot.camera.el * M.D2R));
    assert.ok(shot.pos[1] >= M.CAMERA.floor - 1e-7);
    near(shot.fov, 45);
  }
});

test('legacy normalized distances migrate to metres without restoring the pelvic target', () => {
  const legacy = M.normalizeCamera({ az: 90, el: 20, dist: 0.6 });
  assert.equal(legacy.version, 2); near(legacy.distance, 0.65);
  assert.equal(legacy.focus, 'chest'); assert.equal(legacy.az, 90);
  const reloaded = M.normalizeCamera(JSON.parse(JSON.stringify(legacy)));
  assert.deepEqual(reloaded, legacy);
});

test('all presets use physical distance and face close-up explicitly selects the head', () => {
  for (const preset of M.CAM_PRESETS) {
    assert.ok(preset.c.distance >= 0.2 && preset.c.distance <= 8);
    assert.ok(['head', 'chest', 'whole'].includes(preset.c.focus));
  }
  assert.equal(M.CAM_PRESETS.find(p => p.en === 'Face close-up').c.focus, 'head');
});
