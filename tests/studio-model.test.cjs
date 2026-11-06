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
  assert.equal(p.lArm.wristPitch, 0); assert.equal(p.lArm.index, 14); assert.equal(p.lArm.e, 75); assert.equal(p.lLeg.anklePitch, 0);
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

test('reaching moves a hand or foot onto the target point', () => {
  const pose = M.normalizePose({ preset: 'stand' }), J = M.skeleton(pose);
  for (const offset of [[0.05, 0.3, 0.35], [-0.2, 0.9, 0.1], [0.3, 0.6, 0.36]]) {
    const target = M.add(J.rWrist, offset), solved = M.reach(pose, 'r', 'Arm', 'rWrist', target);
    assert.ok(Math.hypot(...M.sub(M.skeleton(solved).rWrist, target)) < 0.03, `arm misses ${offset}`);
  }
  const foot = M.add(J.lAnkle, [0, 0.25, 0.3]), leg = M.reach(pose, 'l', 'Leg', 'lAnkle', foot), K = M.skeleton(leg);
  assert.ok(Math.hypot(...M.sub(M.sub(K.lAnkle, K.pelvis), M.sub(foot, J.pelvis))) < 0.03);
});

test('body types change height and are named in the pose words', () => {
  const height = body => M.skeleton(M.normalizePose({ body })).head[1];
  assert.ok(height('child') < height('female') && height('female') < height('male'));
  assert.equal(M.normalizePose({ body: 'giant' }).body, 'male');
  assert.match(M.describePose(M.normalizePose({ body: 'strong' }), null, 'en'), /muscular build/);
});

test('props are kept, one hand item at a time is up to the UI, and they appear in the words', () => {
  const p = M.normalizePose({ props: ['phone', 'table', 'nonsense'] });
  assert.equal(p.props.join(','), 'phone,table');
  const words = M.describePose(p, { az: 0 }, 'en');
  assert.match(words, /holding a phone/); assert.match(words, /a table in front/);
  assert.match(M.describePose(M.normalizePose({ preset: 'sit', seated: true, props: ['chair'] }), { az: 0 }, 'en'), /sitting on a chair/);
});

test('light words follow where the light is seen from the camera', () => {
  const cam = { az: 0 };
  assert.match(M.describeLight({ az: 0, el: 30 }, cam, 'en'), /front lighting/);
  assert.match(M.describeLight({ az: 90, el: 15 }, cam, 'en'), /side lighting from the left/);
  assert.match(M.describeLight({ az: 270, el: 15 }, cam, 'en'), /side lighting from the right/);
  assert.match(M.describeLight({ az: 180, el: 20, soft: false }, cam, 'en'), /backlit.*hard light/);
  assert.match(M.describeLight({ az: 0, el: 80 }, cam, 'zh'), /顶光/);
});

test('a second person makes a two-shot and is named by frame side', () => {
  const scene = M.describeScene({ cam: { az: 0, el: 5, distance: 3.6 }, pose: {}, second: true, pose2: { x: 0.9, yaw: 60 } }, 'en', 16 / 9);
  assert.match(scene.camera, /two-shot/);
  assert.match(scene.pose, /person on the left: .*; person on the right: /);
  const solo = M.describeScene({ cam: { az: 0, el: 5, distance: 3.6 }, pose: {} }, 'en', 16 / 9);
  assert.doesNotMatch(solo.camera, /two-shot/);
});

test('children have shorter relative limbs and a larger head-to-height ratio', () => {
  const adult = M.skeleton(M.normalizePose({ body: 'male' })), child = M.skeleton(M.normalizePose({ body: 'child' }));
  const length = (J, a, b) => Math.hypot(...M.sub(J[a], J[b]));
  assert.ok(length(child, 'lHip', 'lKnee') / child.headSize < length(adult, 'lHip', 'lKnee') / adult.headSize * 0.7);
  assert.ok(length(child, 'lShoulder', 'lElbow') / child.headSize < length(adult, 'lShoulder', 'lElbow') / adult.headSize * 0.75);
  const heads = J => (J.head[1] + 0.12 * J.headSize) / (0.24 * J.headSize);
  assert.ok(heads(child) > 5 && heads(child) < 6);
  assert.ok(heads(adult) > 7 && heads(adult) < 8);
  assert.ok(M.measurements('female').shoulder < M.B.shoulder && M.measurements('female').hip > M.B.hip);
  assert.ok(M.measurements('strong').shoulder > M.B.shoulder);
});

test('camera head focus and reaching follow each body type at either model position', () => {
  for (const body of Object.keys(M.BODY_TYPES)) {
    const p = M.normalizePose({ body, x: 0.85, z: 0.2 }), J = M.skeleton(p);
    const target = M.cameraTarget({ focus: 'head' }, J);
    assert.ok(target[1] > J.neck[1] && target[2] > J.head[2]);
    const goal = M.add(J.rWrist, [0, 0.15 * J.scale, 0.2 * J.scale]);
    const next = M.reach(p, 'r', 'Arm', 'rWrist', goal), K = M.skeleton(next);
    assert.ok(Math.hypot(...M.sub(K.rWrist, goal)) < 0.03, body);
  }
});

test('spacing sets the horizontal distance, preserves poses and stays inside placement limits', () => {
  const a = M.normalizePose({ ...M.PRESETS.find(x => x.id === 'run').pose, body: 'female', x: -0.4, z: 0.2 });
  const b = M.normalizePose({ body: 'child', x: 0.8, z: 0.6 });
  for (const distance of [0.2, 0.8, 1.5, 4]) {
    const [A, B] = M.spaceModels(a, b, distance);
    assert.ok(Math.abs(M.modelDistance(A, B) - distance) < 1e-10);
    assert.equal(A.preset, a.preset); assert.deepEqual(A.lLeg, a.lLeg); assert.equal(B.body, 'child');
    assert.ok(Math.abs((A.x + B.x) / 2 - 0.2) < 1e-10);
    for (const p of [A, B]) assert.ok(Math.abs(p.x) <= 3 && Math.abs(p.z) <= 3);
  }
  const [A, B] = M.spaceModels({ x: 3, z: 3 }, { x: 3, z: 3 }, 4);
  assert.equal(M.modelDistance(A, B), 4);
  for (const p of [A, B]) assert.ok(Math.abs(p.x) <= 3 && Math.abs(p.z) <= 3);
});

test('holding a cup keeps it upright across the pose presets without replacing the arm action', () => {
  for (const preset of M.PRESETS) {
    const original = M.normalizePose({ ...preset.pose, body: 'female' }), p = M.holdProp(original, 'cup');
    const up = M.mv(M.propFrame(p, 'cup').matrix, [0, 1, 0]);
    assert.ok(up[1] > 0.99, `${preset.id}: cup tilts ${up[1]}`);
    assert.deepEqual(p.lLeg, original.lLeg); assert.deepEqual(p.rLeg, original.rLeg);
    if (preset.id !== 'stand' && preset.id !== 'lookback') {
      for (const key of ['a', 'b', 'c', 'd']) assert.equal(p.rArm[key], original.rArm[key], `${preset.id}: arm ${key} changed`);
    }
  }
});

test('props share the skin hand frame through body, arm and wrist rotations', () => {
  for (const body of Object.keys(M.BODY_TYPES)) for (const prop of Object.keys(M.PROP_ATTACHMENTS)) {
    const p = M.holdProp(M.normalizePose({ body, yaw: 60, x: 0.8, z: -0.4 }), prop);
    p.rArm.wristPitch += 10;
    const J = M.skeleton(p), F = M.propFrame(p, prop, J), R = J.rHandM;
    const transpose = [R[0], R[3], R[6], R[1], R[4], R[7], R[2], R[5], R[8]];
    const local = M.mul(M.mv(transpose, M.sub(F.position, J.rWrist)), 1 / J.handSize);
    local.forEach((n, i) => assert.ok(Math.abs(n - M.PROP_ATTACHMENTS[prop].position[i]) < 1e-10));
    assert.ok(F.matrix.every(Number.isFinite));
    assert.deepEqual(M.skinFrames(p, J).rHand.matrix, J.rHandM);
  }
});

test('the phone lies in the palm with the fingers round its edge, and the hand closes round the umbrella', () => {
  const localTips = prop => {
    const p = M.holdProp(M.normalizePose({}), prop), J = M.skeleton(p), F = M.propFrame(p, prop, J), R = F.matrix;
    const T = [R[0], R[3], R[6], R[1], R[4], R[7], R[2], R[5], R[8]], H = M.handRig(p, 'r', J);
    return ['thumb', 'index', 'middle', 'ring', 'pinky'].map(k => M.mul(M.mv(T, M.sub(H['r' + k + 'Tip'], F.position)), 1 / F.scale));
  };
  // Phone across the palm: fingers come round the far edge onto the screen side, thumb on the near edge.
  const phone = localTips('phone');
  for (const p of phone.slice(1, 4)) assert.ok(p[2] < 0.002 && p[0] < -0.012, `finger tip not round the far edge (${p})`);
  assert.ok(phone[0][2] < 0 && Math.abs(phone[0][1]) < 0.1, 'thumb should rest on the screen side of the phone');
  for (const p of localTips('umbrella').slice(1)) assert.ok(Math.abs(Math.hypot(p[0], p[2]) - 0.016) < 0.01, 'fingers should close round the umbrella handle');
});

test('legacy held props migrate once and later finger edits survive a reload', () => {
  const old = M.normalizePose({ props: ['phone'], body: 'child' }), migrated = M.migratePose(old);
  assert.equal(migrated.gripVersion, 1); assert.ok(migrated.rArm.b > 15);
  migrated.rArm.index = 17; migrated.rArm.wristPitch = 12;
  const again = M.migratePose(migrated);
  assert.equal(again.rArm.index, 17); assert.equal(again.rArm.wristPitch, 12);
  assert.equal(again.body, 'child');
});

test('a held cup is described as holding rather than an empty fist', () => {
  const p = M.holdProp(M.normalizePose({}), 'cup'); p.preset = null;
  assert.match(M.describePose(p, null, 'en'), /holding a cup/);
  assert.doesNotMatch(M.describePose(p, null, 'en'), /right hand in a fist/);
  assert.doesNotMatch(M.describePose(p, null, 'zh'), /右手握拳/);
});

test('side controls still spread a forward-raised arm and a seated thigh', () => {
  const leg = M.normalizePose({ seated: true, lLeg: { a: 90, b: 45 } }), L = M.skeleton(leg);
  assert.ok(L.lKnee[0] - L.lHip[0] > 0.3, 'a seated knee must move outwards');
  const arm = M.normalizePose({ rArm: { a: 40, b: 90, c: 0 } }), A = M.skeleton(arm);
  assert.ok(A.rShoulder[0] - A.rElbow[0] > 0.15, 'a forward arm must still move sideways');
});

test('an arm that would cut through the torso is moved just clear of it', () => {
  for (const body of Object.keys(M.BODY_TYPES)) {
    const p = M.normalizePose({ body, rArm: { a: -30, b: 10, c: 120 } });
    assert.ok(M.armPenetration(p, 'r') > 0.5, `${body}: test pose should clip`);
    M.resolveArms(p);
    assert.equal(M.armPenetration(p, 'r'), 0, `${body}: arm still inside the body`);
    assert.ok(p.rArm.a - -30 <= 80 && Math.abs(p.rArm.b - 10) <= 70);
  }
  const relaxed = M.normalizePose({ lArm: { a: 75, c: 25 }, rArm: { a: 75, c: 25 } }), before = JSON.stringify(relaxed);
  M.resolveArms(relaxed); assert.equal(JSON.stringify(relaxed), before, 'a clear pose is left alone');
});

test('sitting switches the legs while preserving the current arms, props and placement', () => {
  const original = M.holdProp(M.normalizePose({ ...M.PRESETS.find(p => p.id === 'run').pose, body: 'female', x: 0.4, z: -0.2 }), 'phone');
  const p = M.setSeated(original, true), sitting = M.PRESETS.find(x => x.id === 'sit').pose;
  assert.equal(p.seated, true); assert.deepEqual(p.lLeg, sitting.lLeg); assert.deepEqual(p.rLeg, sitting.rLeg);
  assert.deepEqual(p.lArm, original.lArm); assert.deepEqual(p.rArm, original.rArm); assert.deepEqual(p.props, original.props);
  assert.equal(p.body, 'female'); assert.equal(p.x, 0.4); assert.equal(p.z, -0.2);
  const stand = M.setSeated(p, false); assert.equal(stand.seated, false); assert.deepEqual(stand.lLeg, M.BASE().lLeg);
});

test('small joint edits stop at the last clear angle without jumping other joints', () => {
  const previous = M.resolveArms(M.normalizePose({ rArm: { a: -30, b: 10, c: 120 } }));
  let requested = null;
  for (const key of ['a', 'b', 'c', 'd']) for (const delta of [-10, 10]) {
    const p = M.normalizePose(previous); p.rArm[key] += delta;
    if (M.armPenetration(p, 'r') > 0 && !requested) requested = p;
  }
  assert.ok(requested, 'regression needs an edit into the body');
  const before = { ...requested.rArm }; M.resolveArms(requested, { previous });
  assert.equal(M.armPenetration(requested, 'r'), 0); assert.deepEqual(requested.lArm, previous.lArm);
  for (const key of Object.keys(before)) assert.ok(requested.rArm[key] >= Math.min(before[key], previous.rArm[key]) - 1e-9 && requested.rArm[key] <= Math.max(before[key], previous.rArm[key]) + 1e-9, key);
});

test('gaze points the face at a target and stays in a natural range', () => {
  for (const target of [[1, 1.6, 2], [-1, 1.6, 2], [0, 0, 1], [0, 3, 1], [0, 1.6, -3]]) {
    const p = M.lookAt(M.normalizePose({}), target), J = M.skeleton(p);
    assert.ok(Math.abs(p.neckYaw - p.headYaw) <= 75.5 && Math.abs(p.neckPitch + p.headPitch) <= 35.5, `gaze too far for ${target}`);
    assert.equal(p.neckTilt, 0); assert.equal(p.headTilt, 0);
    const reachable = target[2] > 0 && Math.abs(target[1] - J.head[1]) < 1;
    if (reachable) assert.ok(M.dot(J.headForward, M.norm(M.sub(target, J.head))) > 0.95, `not facing ${target}`);
    // Too steep (the floor right in front, or far overhead): the head stops at the comfortable limit.
    else if (target[2] > 0) assert.ok(Math.abs(Math.abs(p.neckPitch + p.headPitch) - 35) <= 1, `should stop at the pitch limit for ${target}`);
  }
});

test('lens choice narrows the view and names the lens in the prompt', () => {
  assert.equal(M.normalizeCamera({ lens: 85 }).lens, 85);
  assert.equal(M.normalizeCamera({ lens: 77 }).lens, 0);
  assert.ok(M.camFov({ lens: 135 }) < M.camFov({ lens: 50 }) && M.camFov({ lens: 50 }) < M.camFov({ lens: 24 }));
  assert.match(M.describeCamera({ az: 0, el: 0, distance: 8, lens: 85 }, 'en'), /85mm portrait lens/);
  assert.doesNotMatch(M.describeCamera({ az: 0, el: 0, distance: 3 }, 'en'), /mm/);
});
