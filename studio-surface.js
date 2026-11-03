/* A continuous, smoothly blended male body, skinned to the same FK joints as the editor.
   Geometry is generated once; posing only moves bones. No external model assets. */
const StudioSurface = (() => {
  function create(M, material, rig) {
    // Bind with the arms slightly separated from the torso, so a raised arm cannot
    // pull skin from the hip simply because the hand rests nearby in the standing pose.
    const bindPose = M.BASE(); bindPose.lArm.a = bindPose.rArm.a = 25; bindPose.lArm.c = bindPose.rArm.c = 5;
    const rest = M.skeleton(bindPose), records = [], joints = [], bones = [];
    for (const s of ['l', 'r']) { rest[s + 'ToeBase'] = M.add(rest[s + 'Ankle'], M.mv(rest[s + 'FootM'], [0, -0.02, 0.1])); rest[s + 'ToeM'] = rest[s + 'FootM']; }
    const node = (name, joint, matrix) => {
      const index = joints.length, bone = new THREE.Bone();
      bone.name = name; rig.add(bone); bones.push(bone); joints.push({ name, joint, matrix });
      return index;
    };
    const pelvis = node('pelvis', 'pelvis', 'bodyM'), torso = node('torso', 'waist', 'ubM');
    const neck = node('neck', 'chest', 'neckM'), head = node('head', 'head', 'headM');
    function ellipsoid(bone, offset, radii) {
      const joint = joints[bone], R = rest[joint.matrix], center = M.add(rest[joint.joint], M.mv(R, offset));
      records.push({ kind: 'ellipsoid', bone, center, R, radii });
    }
    function capsule(bone, from, to, r0, r1) {
      const a = rest[from], b = rest[to], d = M.sub(b, a), length2 = M.dot(d, d);
      records.push({ kind: 'capsule', bone, a, d, length2, r0, r1 });
    }
    ellipsoid(pelvis, [0, -0.005, -0.008], [0.142, 0.151, 0.108]);
    ellipsoid(pelvis, [0, 0.115, 0], [0.109, 0.156, 0.085]);
    ellipsoid(torso, [0, 0.075, -0.003], [0.123, 0.161, 0.09]);
    ellipsoid(torso, [0, 0.175, -0.005], [0.174, 0.16, 0.104]);
    ellipsoid(torso, [0, 0.235, -0.007], [0.177, 0.105, 0.09]);
    ellipsoid(neck, [0, 0.088, 0], [0.041, 0.12, 0.042]);
    ellipsoid(head, [0, 0.014, -0.005], [0.088, 0.12, 0.096]);
    ellipsoid(head, [0, -0.067, 0.014], [0.067, 0.068, 0.074]);
    for (const [s, sign] of [['l', 1], ['r', -1]]) {
      const upper = node(s + 'Upper', s + 'Shoulder', s + 'ArmM');
      const fore = node(s + 'Fore', s + 'Elbow', s + 'ForeM');
      const hand = node(s + 'Hand', s + 'Wrist', s + 'HandM');
      const thigh = node(s + 'Thigh', s + 'Hip', s + 'LegM');
      const shin = node(s + 'Shin', s + 'Knee', s + 'ShinM');
      const foot = node(s + 'Foot', s + 'Ankle', s + 'FootM');
      const toes = node(s + 'Toes', s + 'ToeBase', s + 'ToeM');
      // Deltoid blends into the rib cage and upper arm, without a separate shoulder ball.
      ellipsoid(upper, [0, -0.02, -0.003], [0.059, 0.071, 0.061]);
      capsule(upper, s + 'Shoulder', s + 'Elbow', 0.049, 0.032);
      ellipsoid(upper, [0, -0.115, 0.003], [0.049, 0.116, 0.053]);
      capsule(fore, s + 'Elbow', s + 'Wrist', 0.034, 0.022);
      ellipsoid(fore, [0, -0.075, 0], [0.038, 0.092, 0.036]);
      ellipsoid(hand, [0, -0.039, 0], [0.035, 0.05, 0.019]);
      // Thighs begin inside the pelvis. Their radius tapers continuously to the knee.
      capsule(thigh, s + 'Hip', s + 'Knee', 0.077, 0.046);
      ellipsoid(thigh, [sign * 0.002, -0.135, 0.004], [0.083, 0.171, 0.088]);
      capsule(shin, s + 'Knee', s + 'Ankle', 0.043, 0.024);
      ellipsoid(shin, [0, -0.125, -0.014], [0.049, 0.146, 0.053]);
      ellipsoid(foot, [0, -0.012, -0.022], [0.033, 0.042, 0.045]);
      ellipsoid(foot, [0, -0.027, 0.035], [0.041, 0.032, 0.082]);
      ellipsoid(toes, [0, -0.009, 0.025], [0.045, 0.025, 0.049]);
    }
    function distance(record, x, y, z) {
      if (record.kind === 'capsule') {
        const dx = x - record.a[0], dy = y - record.a[1], dz = z - record.a[2];
        const t = Math.max(0, Math.min(1, (dx * record.d[0] + dy * record.d[1] + dz * record.d[2]) / record.length2));
        return Math.hypot(dx - record.d[0] * t, dy - record.d[1] * t, dz - record.d[2] * t) - record.r0 - (record.r1 - record.r0) * t;
      }
      const dx = x - record.center[0], dy = y - record.center[1], dz = z - record.center[2], R = record.R;
      const px = R[0] * dx + R[3] * dy + R[6] * dz, py = R[1] * dx + R[4] * dy + R[7] * dz, pz = R[2] * dx + R[5] * dy + R[8] * dz;
      const [rx, ry, rz] = record.radii;
      const k0 = Math.hypot(px / rx, py / ry, pz / rz), k1 = Math.hypot(px / (rx * rx), py / (ry * ry), pz / (rz * rz));
      return k1 > 1e-8 ? k0 * (k0 - 1) / k1 : -Math.min(rx, ry, rz);
    }
    let geometry;
    if (typeof StudioBodyData !== 'undefined') {
      const decode = (value, Type) => { const raw = atob(value), bytes = new Uint8Array(raw.length); for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i); return new Type(bytes.buffer); };
      geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(Float32Array.from(decode(StudioBodyData.position, Int16Array), x => x / 10000), 3));
      geometry.setAttribute('normal', new THREE.Int8BufferAttribute(decode(StudioBodyData.normal, Int8Array), 3, true));
      geometry.setAttribute('skinIndex', new THREE.Uint8BufferAttribute(decode(StudioBodyData.skinIndex, Uint8Array), 4));
      geometry.setAttribute('skinWeight', new THREE.Uint8BufferAttribute(decode(StudioBodyData.skinWeight, Uint8Array), 4, true));
      geometry.setIndex(new THREE.BufferAttribute(decode(StudioBodyData.index, Uint16Array), 1));
    } else {
    const resolution = 108, scale = [0.56, 1.08, 0.32], center = [0, 1, 0];
    const field = new THREE.MarchingCubes(resolution, material, false, false, 110000);
    field.isolation = 0;
    let index = 0;
    for (let z = 0; z < resolution; z++) for (let y = 0; y < resolution; y++) for (let x = 0; x < resolution; x++) {
      const px = (x / resolution * 2 - 1) * scale[0], py = (y / resolution * 2 - 1) * scale[1] + center[1], pz = (z / resolution * 2 - 1) * scale[2];
      let d = 10;
      for (const r of records) {
        const other = distance(r, px, py, pz), k = 0.021;
        const h = Math.max(k - Math.abs(d - other), 0) / k;
        d = Math.min(d, other) - h * h * k * 0.25;
      }
      field.field[index++] = -d;
    }
    field.update();
    // Weld coincident marching-cubes vertices. The indexed surface has shared smooth
    // normals, and no visible caps, overlapping primitives or seams at the hip.
    const positions = [], normals = [], indices = [], lookup = new Map();
    for (let i = 0; i < field.count; i++) {
      const x = field.positionArray[i * 3] * scale[0], y = field.positionArray[i * 3 + 1] * scale[1] + center[1], z = field.positionArray[i * 3 + 2] * scale[2];
      const key = `${Math.round(x * 100000)},${Math.round(y * 100000)},${Math.round(z * 100000)}`;
      let id = lookup.get(key);
      if (id === undefined) {
        id = positions.length / 3; lookup.set(key, id); positions.push(x, y, z);
        const nx = field.normalArray[i * 3] / scale[0], ny = field.normalArray[i * 3 + 1] / scale[1], nz = field.normalArray[i * 3 + 2] / scale[2], len = Math.hypot(nx, ny, nz) || 1;
        normals.push(nx / len, ny / len, nz / len);
      }
      indices.push(id);
    }
    field.geometry.dispose();
    geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3)); geometry.setIndex(indices);
    const skinIndices = [], skinWeights = [];
    const distances = new Float32Array(bones.length);
    const links = { pelvis: ['torso', 'lThigh', 'rThigh'], torso: ['pelvis', 'neck', 'lUpper', 'rUpper'], neck: ['torso', 'head'], head: ['neck'] };
    for (const s of ['l', 'r']) {
      links[s + 'Upper'] = ['torso', s + 'Fore']; links[s + 'Fore'] = [s + 'Upper', s + 'Hand']; links[s + 'Hand'] = [s + 'Fore'];
      links[s + 'Thigh'] = ['pelvis', s + 'Shin']; links[s + 'Shin'] = [s + 'Thigh', s + 'Foot']; links[s + 'Foot'] = [s + 'Shin', s + 'Toes']; links[s + 'Toes'] = [s + 'Foot'];
    }
    const neighbors = joints.map(j => new Set([j.name, ...links[j.name]].map(name => joints.findIndex(x => x.name === name))));
    for (let i = 0; i < positions.length; i += 3) {
      distances.fill(10);
      for (const r of records) distances[r.bone] = Math.min(distances[r.bone], distance(r, positions[i], positions[i + 1], positions[i + 2]));
      let dominant = 0; for (let b = 1; b < bones.length; b++) if (distances[b] < distances[dominant]) dominant = b;
      const weights = Array.from(distances, (d, bone) => ({ bone, weight: neighbors[dominant].has(bone) ? Math.exp(-Math.pow(Math.max(0, d + 0.008) / 0.035, 2)) : 0 })).sort((a, b) => b.weight - a.weight).slice(0, 4);
      const sum = weights.reduce((s, w) => s + w.weight, 0) || 1;
      for (const w of weights) { skinIndices.push(w.bone); skinWeights.push(w.weight / sum); }
    }
    geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(skinIndices, 4)); geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute(skinWeights, 4));
    }
    const rotation = new THREE.Matrix4();
    function update(J, pose = M.BASE()) {
      for (const s of ['l', 'r']) { J[s + 'ToeBase'] = M.add(J[s + 'Ankle'], M.mv(J[s + 'FootM'], [0, -0.02, 0.1])); J[s + 'ToeM'] = M.chain(J[s + 'FootM'], M.rx(-pose[s + 'Leg'].toe)); }
      joints.forEach((j, i) => {
        const p = J[j.joint], R = J[j.matrix]; bones[i].position.set(...p);
        rotation.set(R[0], R[1], R[2], 0, R[3], R[4], R[5], 0, R[6], R[7], R[8], 0, 0, 0, 0, 1); bones[i].quaternion.setFromRotationMatrix(rotation);
        // Body type: overall height plus per-bone girth (bones are not nested, so scales never compound).
        const h = J.scale || 1, g = ((M.BODY_TYPES && M.BODY_TYPES[pose.body]) || { girth: {} }).girth[j.name] || [1, 1, 1];
        bones[i].scale.set(h * g[0], h * g[1], h * g[2]);
      });
      rig.updateMatrixWorld(true);
    }
    update(rest);
    const skeleton = new THREE.Skeleton(bones), body = new THREE.SkinnedMesh(geometry, material);
    body.name = 'Continuous male mannequin'; body.castShadow = true; body.receiveShadow = true; rig.add(body); body.bind(skeleton);
    return { body, skeleton, geometry, update, vertices: geometry.getAttribute('position').count };
  }
  return { create };
})();
