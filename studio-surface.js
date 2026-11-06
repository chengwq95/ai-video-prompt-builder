/* Anatomical CC0 mesh with authored joint weights and integrated, articulated hands.
   Build data with tools/build-body.cjs. Body variants share the same edge-loop topology. */
const StudioSurface = (() => {
  function create(M, material, rig) {
    const data = StudioBodyData;
    if (data.version !== 3) throw new Error('The anatomical body data must be rebuilt');
    M.setCollisionData(data);
    const decode = (value, Type) => {
      const raw = atob(value), bytes = new Uint8Array(raw.length);
      for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
      return new Type(bytes.buffer);
    };
    const ids = decode(data.skinIndex, Uint8Array), weights = decode(data.skinWeight, Uint8Array), index = decode(data.index, Uint16Array);
    const variants = new Map();
    function geometryFor(type) {
      if (variants.has(type)) return variants.get(type);
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(Float32Array.from(decode(data.variants[type].position, Int16Array), n => n / 10000), 3));
      geometry.setAttribute('skinIndex', new THREE.Uint8BufferAttribute(ids, 4));
      geometry.setAttribute('skinWeight', new THREE.Uint8BufferAttribute(weights, 4, true));
      geometry.setIndex(new THREE.BufferAttribute(index, 1));
      geometry.computeVertexNormals(); geometry.computeBoundingBox(); geometry.computeBoundingSphere();
      // Soft wood grain as vertex shading, used only by the wood finish (other finishes ignore it).
      const P = geometry.getAttribute('position').array, grain = new Float32Array(P.length);
      for (let i = 0; i < P.length; i += 3) {
        const x = P[i], y = P[i + 1], z = P[i + 2], g = 0.5 + 0.5 * Math.sin(y * 420 + 14 * Math.sin(x * 31 + z * 29) + 6 * Math.sin(y * 11 + x * 5));
        grain[i] = grain[i + 1] = grain[i + 2] = 0.9 + 0.1 * g;
      }
      geometry.setAttribute('color', new THREE.BufferAttribute(grain, 3));
      variants.set(type, geometry); return geometry;
    }
    const bones = data.bones.map(name => { const bone = new THREE.Bone(); bone.name = name; rig.add(bone); return bone; });
    const rotation = new THREE.Matrix4();
    const bindPose = type => M.bindPose(type);
    function updateBones(frames) {
      data.bones.forEach((name, i) => {
        const { position, matrix: R } = frames[name];
        bones[i].position.set(...position);
        rotation.set(R[0], R[1], R[2], 0, R[3], R[4], R[5], 0, R[6], R[7], R[8], 0, 0, 0, 0, 1);
        bones[i].quaternion.setFromRotationMatrix(rotation); bones[i].scale.setScalar(1);
      });
      rig.updateMatrixWorld(true);
    }
    let activeType = 'male';
    updateBones(M.skinFrames(bindPose(activeType)));
    const skeleton = new THREE.Skeleton(bones), body = new THREE.SkinnedMesh(geometryFor(activeType), material);
    body.name = 'Anatomical drawing mannequin'; body.castShadow = true; body.receiveShadow = true; rig.add(body); body.bind(skeleton);
    function update(J, pose = M.BASE()) {
      const type = data.variants[pose.body] ? pose.body : 'male';
      if (type !== activeType) {
        activeType = type; body.geometry = geometryFor(type);
        updateBones(M.skinFrames(bindPose(type))); body.bind(skeleton);
      }
      updateBones(M.skinFrames(pose, J));
    }
    const seatIndices = new Map(), supportPoint = new THREE.Vector3();
    function seatSupport(J, chair = false) {
      if (!seatIndices.has(activeType)) {
        const bind = M.skeleton(bindPose(activeType)), raw = body.geometry.getAttribute('position');
        const allowed = new Set(data.bones.flatMap((name, i) => /^(pelvis|[lr]Thigh)$/.test(name) ? [i] : [])), selected = [];
        for (let i = 0; i < raw.count; i++) {
          let influence = 0; for (let c = 0; c < 4; c++) if (allowed.has(ids[i * 4 + c])) influence += weights[i * 4 + c] / 255;
          if (influence > 0.7 && raw.getY(i) > bind.pelvis[1] - 0.23 * bind.scale) selected.push(i);
        }
        seatIndices.set(activeType, selected);
      }
      const inverse = M.ry(-Math.atan2(J.forward[0], J.forward[2]) / M.D2R);
      let height = Infinity;
      for (const i of seatIndices.get(activeType)) {
        body.getVertexPosition(i, supportPoint);
        const local = M.mul(M.mv(inverse, M.sub(supportPoint.toArray(), J.pelvis)), 1 / J.scale);
        const supported = chair ? Math.abs(local[0]) < 0.22 && local[2] > -0.25 && local[2] < 0.17 : Math.hypot(local[0], local[2] + 0.06) < 0.205;
        if (supported) height = Math.min(height, supportPoint.y);
      }
      return Number.isFinite(height) ? Math.max(0.2 * J.scale, height - 0.004 * J.scale) : 0.42 * J.scale;
    }
    return { body, skeleton, update, seatSupport, get geometry() { return body.geometry; }, get type() { return activeType; }, vertices: data.vertices,
      dispose() { variants.forEach(g => g.dispose()); skeleton.dispose(); } };
  }
  return { create };
})();
