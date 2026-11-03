const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const M = vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../studio-model.js'), 'utf8') + '; CamPoseModel');
const near = (a, b, tolerance = 1e-9) => assert.ok(Math.abs(a - b) < tolerance, `${a} != ${b}`);

test('body yaw, camera azimuth and prompt words use the same handedness at every heading', () => {
  for (const yaw of [-180, -135, -90, -45, 0, 45, 90, 135, 180]) {
    const J = M.skeleton(M.normalizePose({ yaw }));
    for (const relative of [0, 45, 90, 135, 180, 225, 270, 315]) {
      const camera = { az: M.wrap360(yaw + relative), el: 0, dist: 1 };
      near(M.dot(J.forward, M.camDir(camera)), Math.cos(relative * M.D2R));
      const words = M.describeCamera(camera, 'en', yaw);
      if (relative === 0) assert.match(words, /^front view,/);
      if (relative === 90) assert.match(words, /^right side view,/);
      if (relative === 180) assert.match(words, /^back view,/);
      if (relative === 270) assert.match(words, /^left side view,/);
      if (relative === 0) assert.match(M.describePose(M.normalizePose({ yaw }), camera, 'en'), /body facing the camera/);
    }
  }
});

test('the editor exposes 18 parts and 54 distinct bounded angle controls', () => {
  const controls = Object.values(M.PARTS).flatMap(p => p.controls);
  assert.equal(Object.keys(M.PARTS).length, 18);
  assert.equal(controls.length, 54);
  assert.equal(new Set(controls.map(c => c.path)).size, 54);
  const pose = M.BASE();
  for (const c of controls) assert.ok(M.get(pose, c.path) >= c.min && M.get(pose, c.path) <= c.max, c.path);
});

test('legacy saved poses receive defaults for new joints without losing old angles', () => {
  const p = M.normalizePose({ yaw: 60, lArm: { a: 72, b: 35, c: 95, d: 30 }, lLeg: { a: 45, b: 4, c: 60 } });
  assert.equal(p.lArm.a, 72); assert.equal(p.lArm.c, 95); assert.equal(p.lLeg.c, 60);
  assert.equal(p.lArm.wristPitch, 0); assert.equal(p.lArm.index, 8); assert.equal(p.lLeg.anklePitch, 0);
  assert.equal(p.twist, 0); assert.equal(p.rArm.a, 8);
  for (const x of Object.values(M.skeleton(p)).flat()) assert.ok(Number.isFinite(x));
});

test('damaged storage is clamped and cannot inject NaN into a camera or skeleton', () => {
  const p = M.normalizePose({ yaw: Infinity, lean: 1000, lArm: { c: -99, a: 'bad', index: null }, rLeg: null, preset: 'unknown' });
  assert.equal(p.yaw, 0); assert.equal(p.lean, 60); assert.equal(p.lArm.c, 0); assert.equal(p.lArm.a, 8); assert.equal(p.preset, null);
  const c = M.normalizeCamera({ az: -90, el: 500, dist: NaN });
  assert.equal(c.az, 270); assert.equal(c.el, 85); assert.equal(c.distance, 2.8); assert.equal(c.focus, "chest");
  for (const raw of [null, false, {}, { headPitch: NaN }]) for (const x of Object.values(M.skeleton(M.normalizePose(raw))).flat()) assert.ok(Number.isFinite(x));
});

test('all presets preserve bone lengths, and elbow or wrist edits do not move the shoulder', () => {
  for (const preset of M.PRESETS) {
    const J = M.skeleton(M.normalizePose(preset.pose));
    for (const s of ['l', 'r']) {
      near(Math.hypot(...M.sub(J[s + 'Elbow'], J[s + 'Shoulder'])), M.B.upper);
      near(Math.hypot(...M.sub(J[s + 'Wrist'], J[s + 'Elbow'])), M.B.fore);
      near(Math.hypot(...M.sub(J[s + 'Knee'], J[s + 'Hip'])), M.B.thigh);
      near(Math.hypot(...M.sub(J[s + 'Ankle'], J[s + 'Knee'])), M.B.shin);
    }
  }
  const p = M.BASE(), before = M.skeleton(p); p.lArm.c = 90; p.lArm.wristPitch = 50;
  const after = M.skeleton(p);
  assert.deepEqual(before.lShoulder, after.lShoulder); assert.deepEqual(before.lElbow, after.lElbow);
  assert.notDeepEqual(before.lHand, after.lHand); assert.deepEqual(before.rHand, after.rHand);
});

test('ankles inherit the leg frame, and independent foot controls move the toes', () => {
  const p = M.BASE(), J = M.skeleton(p);
  p.lLeg.d = 40; p.lLeg.anklePitch = 30; p.lLeg.ankleRoll = 15;
  const edited = M.skeleton(p);
  assert.notDeepEqual(J.lFootM, edited.lFootM);
  assert.notDeepEqual(J.lToe, edited.lToe);
  for (const x of Object.values(edited).flat()) assert.ok(Number.isFinite(x));
});

test('legacy distance migration remains continuous and physical cameras respect elevation', () => {
  const J = M.skeleton(M.BASE());
  for (const distance of [0.7, 0.85, 1, 1.05, 1.25]) {
    const a = M.shotCamera({ az: 45, el: 30, dist: distance - 1e-7 }, J);
    const b = M.shotCamera({ az: 45, el: 30, dist: distance + 1e-7 }, J);
    assert.ok(Math.hypot(...M.sub(a.target, b.target)) < 0.0001);
    assert.ok(Math.hypot(...M.sub(a.pos, b.pos)) < 0.0001);
  }
  for (const aspect of [9 / 16, 1, 16 / 9]) for (const el of [-30, 0, 40, 75]) {
    const c = { az: 75, el, distance: 1.2, focus: "chest" }, sc = M.shotCamera(c, J, aspect);
    const direction = M.norm(M.sub(sc.pos, sc.target));
    near(direction[1], Math.sin(el * M.D2R));
    const projected = M.makeView(sc.pos, sc.target, sc.fov, 200 * aspect, 200).project(sc.target);
    near(projected.x, 100 * aspect); near(projected.y, 100);
  }
});

test('fine joint edits produce relevant bilingual pose words', () => {
  const p = M.BASE(); p.lArm.index = 0; p.lArm.middle = p.lArm.ring = p.lArm.pinky = 90;
  p.rArm.wristPitch = 45; p.lLeg.anklePitch = 30; p.twist = 30;
  assert.match(M.describePose(p, null, 'en'), /left index finger extended/);
  assert.match(M.describePose(p, null, 'en'), /right wrist/);
  assert.match(M.describePose(p, null, 'zh'), /左脚踝/);
  assert.match(M.describePose(p, null, 'zh'), /胸腰扭转约30度/);
});

test('shot size words follow what the camera actually frames', () => {
  const J = M.skeleton(M.normalizePose({ preset: 'stand' }));
  const words = (distance, focus) => M.describeCamera({ az: 45, el: 10, distance, focus }, 'en', 0, J, 1);
  assert.match(words(0.5, 'head'), /close-up of the face/);
  assert.match(words(1.4, 'chest'), /medium shot, from the waist up/);
  assert.match(words(2.8, 'chest'), /full shot, whole body in frame/);
  assert.match(words(7, 'whole'), /wide shot/);
  assert.match(words(0.4, 'chest'), /head out of frame/);
});
