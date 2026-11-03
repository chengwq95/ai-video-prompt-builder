/* True 3D pose studio. All angles, persisted values and prompt words share studio-model.js. */
const CamPose = (() => {
  const M = CamPoseModel;
  const { D2R, clamp, add, sub, mul, mv, B, PARTS, PRESETS, T, CAM_PRESETS } = M;
  const V = p => new THREE.Vector3(...p);
  const identity = [1, 0, 0, 0, 1, 0, 0, 0, 1];
  const copy = x => JSON.parse(JSON.stringify(x));
  const ui = {
    en: {
      editor: "Studio view · drag background to orbit", actual: "CAMERA VIEW", front: "Front", side: "Right", back: "Back", frame: "Fit scene",
      selected: "Selected joint", resetPart: "Reset joint", mirror: "Mirror this joint", flip: "Swap left / right", joints: "18 parts · 54 angle controls",
      fine: "Select a joint or body surface. Drag to pose; use sliders or arrow keys for precise angles.",
      cameraHelp: "Yellow is the actual camera: drag it closer, through the pink reference arc. Green: orbit · pink: elevation. The target marker shows where the camera aims.",
      unsupported: "This browser could not start 3D. Enable WebGL or try another browser. Angle controls and prompt output still work.",
      context: "3D paused. Restoring the graphics context…", restored: "3D restored", both: "Both sides", left: "Left to right", right: "Right to left", volume: "3D form", drawing: "Study lines", focus: "Look at", headTarget: "Head", chestTarget: "Chest", wholeTarget: "Frame whole body", target: "Aim", distanceHint: "Actual camera distance in metres · 0.20–8.00 m", floorHint: "Lowest angle at this distance"
    },
    zh: {
      editor: "工作视图 · 拖动空白处旋转", actual: "实际镜头画面", front: "正面", side: "右侧", back: "背面", frame: "查看整个场景",
      selected: "当前关节", resetPart: "重置此部位", mirror: "镜像此部位", flip: "左右互换", joints: "18 个部位 · 54 项角度控制",
      fine: "点选关节点或人物表面，拖动调整姿势；滑块和方向键可精确调角度。",
      cameraHelp: "黄色就是真实相机，可穿过粉色参考弧继续靠近。绿色调方位，粉色调仰俯；瞄准点标出实际朝向。",
      unsupported: "浏览器无法启动 3D，请启用 WebGL 或换一个浏览器。角度控制和提示词仍可使用。",
      context: "3D 暂停，正在恢复图形显示…", restored: "3D 已恢复", both: "左右两侧", left: "左侧复制到右侧", right: "右侧复制到左侧", volume: "立体素体", drawing: "绘画线稿", focus: "镜头瞄准", headTarget: "头部", chestTarget: "胸部", wholeTarget: "全身取景", target: "瞄准", distanceHint: "真实相机距离，单位为米 · 0.20–8.00 m", floorHint: "当前距离的最低角度"
    }
  };

  function create(root, opts = {}) {
    let lang = opts.lang || "en", ratio = opts.ratio || "1:1";
    let state = { tab: "camera", cam: M.normalizeCamera(opts.value?.cam), pose: M.normalizePose(opts.value?.pose || { preset: "stand" }), part: "rArm" };
    let view = { yaw: 25, pitch: 12, dist: 3.8 };
    let width = 0, height = 0, handles = [], dragging = null, scheduled = 0, lost = false, drawing = false;
    let cameraEditorFrame = null, controlCenter = [0, 1, 0];
    root.classList.add("cps");
    root.innerHTML = `
      <div class="cps-top"><div class="cps-tabs" role="tablist" aria-label="3D studio">
        <button type="button" role="tab" data-tab="camera"></button><button type="button" role="tab" data-tab="pose"></button>
      </div><button type="button" class="cps-reset" data-reset></button></div>
        <div class="cps-view-tools"><span class="cps-editor-label"></span><div>
          <button type="button" data-view="front"></button><button type="button" data-view="side"></button><button type="button" data-view="back"></button><button type="button" data-view="frame"></button>
        </div><div class="cps-render-modes"><button type="button" data-mode="volume" aria-pressed="true"></button><button type="button" data-mode="drawing" aria-pressed="false"></button></div></div>
      <div class="cps-stage">
        <canvas class="cps-main" aria-label="Interactive 3D pose studio"></canvas><canvas class="cps-overlay" aria-hidden="true"></canvas>
        <div class="cps-inset"><div class="cps-inset-preview"></div><span class="cps-inset-label"></span></div>
        <div class="cps-status" role="status" hidden></div><div class="cps-help"></div>
      </div>
      <div class="cps-out"><b></b><span class="cps-out-text" aria-live="polite"></span></div>
      <div class="cps-panel" role="tabpanel"></div>`;
    const canvas = root.querySelector(".cps-main"), overlay = root.querySelector(".cps-overlay"), panel = root.querySelector(".cps-panel");
    const inset = root.querySelector(".cps-inset-preview"), ctx = overlay.getContext("2d"), status = root.querySelector(".cps-status");
    const value = () => ({ cam: { ...state.cam }, pose: copy(state.pose) });
    const emit = kind => opts.onChange?.(value(), kind);
    let renderer;
    try {
      renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
      renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.25;
    } catch (e) {
      status.hidden = false;
      status.textContent = ui[lang].unsupported;
    }
    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#141823");
    scene.fog = new THREE.Fog(0x141823, 6, 22);
    const editorCamera = new THREE.PerspectiveCamera(36, 1, 0.05, 80);
    const shot = new THREE.PerspectiveCamera(32, 1, 0.03, 80);
    scene.add(new THREE.HemisphereLight(0xdde8ff, 0x55515a, 2.1));
    const key = new THREE.DirectionalLight(0xffeed6, 3.4);
    key.position.set(-3, 5, 4); key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048); key.shadow.radius = 6;
    Object.assign(key.shadow.camera, { left: -2.5, right: 2.5, top: 3, bottom: -2, near: 0.1, far: 12 });
    key.shadow.bias = -0.0005; key.shadow.normalBias = 0.015;
    scene.add(key);
    const rim = new THREE.DirectionalLight(0x9bbaff, 2.7); rim.position.set(3, 3, -3); scene.add(rim);
    const fill = new THREE.DirectionalLight(0xffddc3, 0.8); fill.position.set(3, 1, 3); scene.add(fill);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), new THREE.MeshStandardMaterial({ color: 0x080c13, roughness: 0.98 }));
    floor.rotation.x = -Math.PI / 2; floor.position.y = -0.008; floor.receiveShadow = true; scene.add(floor);
    const grid = new THREE.GridHelper(10, 40, 0x465369, 0x273140); grid.position.y = -0.005; grid.material.transparent = true; scene.add(grid);
    const helper = new THREE.Group(); scene.add(helper);
    const rig = new THREE.Group(); scene.add(rig);
    const skin = new THREE.MeshStandardMaterial({ color: 0xc6b6a2, roughness: 0.62, metalness: 0.03 });
    const selected = new THREE.MeshStandardMaterial({ color: 0xe0b6a1, roughness: 0.6, emissive: 0x572513, emissiveIntensity: 0.15 });
    const meshes = [], nodes = {}, fingers = {};
    const outlines = [], construction = [];
    const ink = new THREE.MeshBasicMaterial({ color: 0x292d33, side: THREE.BackSide });
    const sphere = new THREE.SphereGeometry(1, 28, 20);

    function group(name, part = name) { const g = new THREE.Group(); g.userData.part = part; nodes[name] = g; rig.add(g); return g; }
    function mesh(g, geometry, part = g.userData.part, material = skin) {
      const m = new THREE.Mesh(geometry, material); m.userData = { part, original: material };
      m.castShadow = true; m.receiveShadow = true; g.add(m); meshes.push(m);
      if (material === skin) { const outline = new THREE.Mesh(geometry, ink); outline.scale.setScalar(1.04); outline.visible = false; m.add(outline); outlines.push(outline); }
      return m;
    }
    function ellipsoid(g, position, scale, part, material) {
      const m = mesh(g, sphere, part, material); m.position.set(...position); m.scale.set(...scale); return m;
    }
    // Elliptical rings give the torso and limbs real depth, taper and a smooth silhouette.
    function surface(rings, segments = 36) {
      // Interpolate the profile before revolving it, avoiding visible bands at the ribs or jaw.
      const smooth = [];
      const cr = (a, b, c, d, t) => 0.5 * (2 * b + (c - a) * t + (2 * a - 5 * b + 4 * c - d) * t * t + (-a + 3 * b - 3 * c + d) * t * t * t);
      for (let i = 0; i < rings.length - 1; i++) for (let j = 0; j < 4; j++) {
        const points = [rings[Math.max(0, i - 1)], rings[i], rings[i + 1], rings[Math.min(rings.length - 1, i + 2)]];
        smooth.push([0, 1, 2, 3].map(k => { const value = cr(...points.map(p => p[k] || 0), j / 4); return k === 1 || k === 2 ? Math.max(0.001, value) : value; }));
      }
      smooth.push(rings[rings.length - 1]); rings = smooth;
      const pos = [], indices = [];
      rings.forEach(([y, x, z, dz = 0]) => {
        for (let i = 0; i <= segments; i++) {
          const a = i / segments * Math.PI * 2; pos.push(x * Math.cos(a), y, z * Math.sin(a) + dz);
        }
      });
      for (let j = 0; j < rings.length - 1; j++) for (let i = 0; i < segments; i++) {
        const a = j * (segments + 1) + i, b = a + segments + 1;
        indices.push(a, b, a + 1, a + 1, b, b + 1);
      }
      const geo = new THREE.BufferGeometry(); geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); geo.setIndex(indices); geo.computeVertexNormals();
      return geo;
    }
    const pelvis = group("pelvis", "body");
    const torso = group("torso", "chest");
    const head = group("head");
    const headProfile = [[-0.127, 0.018, 0.032, 0.022], [-0.112, 0.047, 0.056, 0.019], [-0.075, 0.069, 0.077, 0.008], [-0.035, 0.083, 0.088], [0.015, 0.09, 0.095], [0.065, 0.085, 0.087, -0.006], [0.103, 0.064, 0.066, -0.007], [0.126, 0.025, 0.031], [0.13, 0.001, 0.001]];
    const headGeometry = surface(headProfile);
    function guide(g, points, color = 0x827d74) {
      const geo = new THREE.BufferGeometry().setFromPoints(points.map(V));
      const l = new THREE.Line(geo, new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.7 })); g.add(l); construction.push(l); return l;
    }
    // Follow the actual head surface, so the crosshair rotates and occludes correctly in 3D.
    const positions = headGeometry.getAttribute("position"), meridian = [], eyeLine = [];
    for (let i = 0; i < positions.count; i += 37) {
      const j = i + 9; meridian.push([0, positions.getY(j), positions.getZ(j) + 0.0015]);
    }
    guide(head, meridian);
    const eyeRing = Math.round((positions.count / 37 - 1) * 0.5) * 37;
    for (let i = 0; i <= 36; i++) eyeLine.push([positions.getX(eyeRing + i) * 1.015, positions.getY(eyeRing + i), positions.getZ(eyeRing + i) * 1.015]);
    guide(head, eyeLine); headGeometry.dispose();
    guide(torso, [[0, -0.025, 0.087], [0, 0.075, 0.102], [0, 0.17, 0.112], [0, 0.23, 0.105], [0, 0.29, 0.065]]);
    guide(torso, [[-0.145, 0.145, 0.064], [-0.085, 0.125, 0.098], [0, 0.12, 0.108], [0.085, 0.125, 0.098], [0.145, 0.145, 0.064]]);
    guide(pelvis, Array.from({ length: 65 }, (_, i) => [0.144 * Math.cos(i / 64 * Math.PI * 2), 0.025, 0.109 * Math.sin(i / 64 * Math.PI * 2)]));

    for (const [s, sign] of [["l", 1], ["r", -1]]) {
      const hand = group(s + "Hand", s + "Hand");
      fingers[s] = {};
      ["index", "middle", "ring", "pinky"].forEach((name, i) => {
        const rootFinger = new THREE.Group(); rootFinger.position.set(sign * (0.027 - i * 0.018), -0.074 + (i === 3 ? 0.012 : 0), 0);
        hand.add(rootFinger); const length = [0.073, 0.081, 0.075, 0.058][i], bones = [];
        let parent = rootFinger;
        [0.43, 0.32, 0.25].forEach((share, j) => {
          const bone = new THREE.Group(); parent.add(bone); if (j) bone.position.y = -length * [0.43, 0.32][j - 1];
          const m = ellipsoid(bone, [0, -length * share / 2, 0], [0.007 - i * 0.0004, length * share / 2 + 0.003, 0.007], s + "Fingers");
          m.userData.finger = name; bones.push(bone); parent = bone;
        });
        fingers[s][name] = { root: rootFinger, bones, spread: sign * (1.5 - i) };
      });
      const thumbRoot = new THREE.Group(); thumbRoot.position.set(sign * 0.03, -0.023, 0.004); hand.add(thumbRoot);
      const thumbBones = []; let parent = thumbRoot;
      for (let j = 0; j < 3; j++) {
        const bone = new THREE.Group(); parent.add(bone); if (j) bone.position.y = -0.021;
        ellipsoid(bone, [0, -0.011, 0], [0.01 - j * 0.0015, 0.016, 0.009], s + "Fingers"); thumbBones.push(bone); parent = bone;
      }
      fingers[s].thumb = { root: thumbRoot, bones: thumbBones, spread: 0 };
    }
    const stool = new THREE.Group(); scene.add(stool);
    const stoolMat = new THREE.MeshStandardMaterial({ color: 0x596271, metalness: 0.3, roughness: 0.6 });
    const seat = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.055, 40), stoolMat); seat.position.set(0, B.seat, -0.04); seat.castShadow = true; stool.add(seat);
    for (const x of [-0.15, 0.15]) for (const z of [-0.19, 0.11]) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.017, 0.023, B.seat, 12), stoolMat); leg.position.set(x, B.seat / 2, z); leg.castShadow = true; stool.add(leg);
    }

    // Use one welded and skinned surface for the body. Keep the detailed articulated
    // fingers; the construction groups still provide joint positions and guide lines.
    const continuous = StudioSurface.create(M, skin, rig);
    continuous.body.userData = { part: 'surface', original: skin }; meshes.push(continuous.body);
    const surfaceOutline = new THREE.SkinnedMesh(continuous.geometry, ink);
    rig.add(surfaceOutline); surfaceOutline.bind(continuous.skeleton, continuous.body.bindMatrix);
    surfaceOutline.scale.setScalar(1.003); surfaceOutline.visible = false; outlines.push(surfaceOutline);

    const rotation = new THREE.Matrix4();
    function place(name, p, m = identity) {
      const node = nodes[name]; node.position.set(...p);
      rotation.set(m[0], m[1], m[2], 0, m[3], m[4], m[5], 0, m[6], m[7], m[8], 0, 0, 0, 0, 1);
      node.quaternion.setFromRotationMatrix(rotation);
    }
    function updateFigure() {
      const p = state.pose, J = M.skeleton(p);
      place("pelvis", J.pelvis, J.bodyM); place("torso", J.waist, J.ubM); place("head", J.head, J.headM);
      for (const [s, sign] of [["l", 1], ["r", -1]]) {
        place(s + "Hand", J[s + "Wrist"], J[s + "HandM"]);
        for (const [name, f] of Object.entries(fingers[s])) {
          f.root.rotation.z = name === "thumb" ? sign * (0.7 + p[s + "Arm"].spread * D2R) : f.spread * p[s + "Arm"].spread * D2R;
          f.bones.forEach((bone, j) => { bone.rotation.x = -p[s + "Arm"][name] * D2R * [0.65, 0.85, 0.6][j]; });
        }
      }
      stool.visible = p.seated; continuous.update(J, p);
      continuous.body.computeBoundingBox(); continuous.body.computeBoundingSphere();
      surfaceOutline.boundingBox = continuous.body.boundingBox.clone().expandByScalar(0.005);
      surfaceOutline.boundingSphere = continuous.body.boundingSphere.clone(); surfaceOutline.boundingSphere.radius += 0.005;
      rig.updateMatrixWorld(true); return J;
    }

    function line(points, color, dashed = false) {
      const geo = new THREE.BufferGeometry().setFromPoints(points.map(V));
      const material = dashed ? new THREE.LineDashedMaterial({ color, dashSize: 0.07, gapSize: 0.04 }) : new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.75 });
      const l = new THREE.Line(geo, material); if (dashed) l.computeLineDistances(); helper.add(l); return l;
    }
    const azRing = line(Array.from({ length: 97 }, (_, i) => mul(M.camDir({ az: i * 360 / 96, el: 0 }), 1.35)), 0x43dbb3); azRing.position.y = 0.012;
    const elevationLine = line(Array.from({ length: 65 }, () => [0, 0, 0]), 0xf482b0);
    const sightLine = line([[0, 0, 0], [0, 0, 0]], 0xffbc78, true);
    const cameraBody = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.105, 0.12), new THREE.MeshStandardMaterial({ color: 0xffbc78, roughness: 0.4 }));
    helper.add(cameraBody);
    const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.047, 0.08, 24), cameraBody.material); lens.rotation.x = Math.PI / 2; lens.position.z = 0.09; cameraBody.add(lens);
    const raycaster = new THREE.Raycaster();
    function project(point) {
      const p = V(point).project(editorCamera); return { x: (p.x + 1) * width / 2, y: (1 - p.y) * height / 2, z: p.z };
    }
    function handle(p, id, color, radius = 6, label = "") {
      const q = project(p); if (q.z < -1 || q.z > 1) return;
      const active = id === "part:" + state.part;
      ctx.beginPath(); ctx.arc(q.x, q.y, radius + (active ? 3 : 0), 0, Math.PI * 2);
      ctx.fillStyle = active ? "#ffcc96" : color; ctx.fill(); ctx.lineWidth = active ? 2 : 1.5; ctx.strokeStyle = "#17202d"; ctx.stroke();
      if (active) { ctx.beginPath(); ctx.arc(q.x, q.y, radius + 6, 0, Math.PI * 2); ctx.strokeStyle = "rgba(255,204,150,.6)"; ctx.lineWidth = 1; ctx.stroke(); }
      if (label) { ctx.font = "11px system-ui"; ctx.fillStyle = color; ctx.fillText(label, q.x + 13, q.y + 4); }
      handles.push({ ...q, id, radius: Math.max(12, radius + 5) });
    }
    const controlPoint = (id, cam = state.cam) => M.cameraControlPoint(cam, id, controlCenter);
    function insetRect() {
      const a = canvas.getBoundingClientRect(), b = inset.getBoundingClientRect();
      return { x: b.left - a.left, y: height - (b.top - a.top) - b.height, width: b.width, height: b.height };
    }
    function fitShot(J, r) {
      state.cam = M.constrainCamera(state.cam, J);
      const spec = M.shotCamera(state.cam, J);
      shot.aspect = r.width / r.height; shot.fov = spec.fov; shot.position.copy(V(spec.pos)); shot.lookAt(V(spec.target)); shot.updateProjectionMatrix(); shot.updateMatrixWorld();
      return spec;
    }
    function renderNow() {
      scheduled = 0;
      if (!renderer || lost || !width || !height) return;
      const background = drawing ? 0xebe9e3 : 0x141823;
      scene.background.setHex(background); scene.fog.color.setHex(background);
      grid.material.opacity = drawing ? 0.16 : 0.65;
      floor.material.color.setHex(drawing ? 0xd9d6cd : 0x161a25);
      skin.color.setHex(drawing ? 0xf2f0e8 : 0xc6b6a2);
      outlines.forEach(m => { m.visible = drawing; });
      construction.forEach(l => { l.material.color.setHex(drawing ? 0x666666 : 0x827d74); });
      const J = updateFigure(), r = insetRect(), spec = fitShot(J, r);
      const rigBox = new THREE.Box3().setFromObject(rig);
      const look = rigBox.getCenter(new THREE.Vector3());
      look.y = Math.max(0.7, look.y);
      // One physical camera pose drives the yellow icon, sight line and preview.
      controlCenter = spec.target;
      const cameraP = spec.pos;
      const far = state.tab === "camera" ? 1.3 / Math.min(1, width / height) : 1;
      let editorDistance = view.dist * far;
      if (state.tab === "camera" && !cameraEditorFrame) {
        const points = [V(cameraP)];
        for (const x of [rigBox.min.x, rigBox.max.x]) for (const y of [rigBox.min.y, rigBox.max.y]) for (const z of [rigBox.min.z, rigBox.max.z]) points.push(new THREE.Vector3(x, y, z));
        for (let az = 0; az < 360; az += 5) points.push(V(add(mul(M.camDir({ az, el: 0 }), 1.35), [controlCenter[0], 0.012, controlCenter[2]])));
        for (let el = -60; el <= 85; el += 3) points.push(V(add(controlCenter, mul(M.camDir({ az: state.cam.az, el }), M.CAMERA.guideRadius))));
        new THREE.Box3().setFromPoints(points).getCenter(look);
        const direction = V(M.camDir({ az: view.yaw, el: view.pitch }));
        const right = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), direction).normalize();
        const up = new THREE.Vector3().crossVectors(direction, right).normalize();
        const vf = Math.tan(18 * D2R), hf = vf * width / height;
        for (const p of points) {
          const d = p.clone().sub(look);
          editorDistance = Math.max(editorDistance, d.dot(direction) + Math.max(Math.abs(d.dot(right)) / hf, Math.abs(d.dot(up)) / vf) * 1.18);
        }
        cameraEditorFrame = { look: look.clone(), distance: editorDistance, zoom: view.dist };
      }
      if (state.tab === 'camera' && cameraEditorFrame) {
        look.copy(cameraEditorFrame.look);
        editorDistance = cameraEditorFrame.distance * view.dist / cameraEditorFrame.zoom;
      }
      editorCamera.aspect = width / height;
      editorCamera.position.copy(look.clone().addScaledVector(V(M.camDir({ az: view.yaw, el: view.pitch })), editorDistance));
      editorCamera.lookAt(look); editorCamera.updateProjectionMatrix(); editorCamera.updateMatrixWorld();
      helper.visible = state.tab === "camera";
      const center = controlCenter;
      if (helper.visible) {
        azRing.position.set(center[0], 0.012, center[2]);
        const points = Array.from({ length: 65 }, (_, i) => add(center, mul(M.camDir({ az: state.cam.az, el: -60 + i * 145 / 64 }), M.CAMERA.guideRadius)));
        elevationLine.geometry.setFromPoints(points.map(V)); elevationLine.geometry.computeBoundingSphere();
        sightLine.geometry.setFromPoints([V(center), V(cameraP)]); sightLine.geometry.computeBoundingSphere(); sightLine.computeLineDistances();
        cameraBody.position.copy(V(cameraP)); cameraBody.lookAt(V(center));
      }
      for (const m of meshes) m.material = state.tab === "pose" && m.userData.part === state.part && m.userData.original === skin ? selected : m.userData.original;
      grid.visible = true;
      renderer.setScissorTest(false); renderer.setViewport(0, 0, width, height); renderer.render(scene, editorCamera);
      ctx.clearRect(0, 0, width, height); handles = [];
      if (state.tab === "camera") {
        handle(controlPoint('az'), "az", "#43dbb3", 8);
        handle(controlPoint('el'), "el", "#f482b0", 8);
        handle(cameraP, "distance", "#ffbc78", 8);
        const targetPoint = project(center), targetText = ui[lang][state.cam.focus + 'Target'];
        ctx.beginPath(); ctx.arc(targetPoint.x, targetPoint.y, 6, 0, Math.PI * 2); ctx.strokeStyle = '#ffce83'; ctx.lineWidth = 2; ctx.stroke();
        // Label on a dark pill so the figure behind it never hides the text.
        const label = ui[lang].target + ': ' + targetText;
        ctx.font = '11px system-ui';
        const lw = ctx.measureText(label).width, lx = targetPoint.x + 12, ly = targetPoint.y - 22;
        ctx.fillStyle = 'rgba(12,14,22,.78)'; ctx.beginPath(); ctx.roundRect(lx - 6, ly, lw + 12, 18, 9); ctx.fill();
        ctx.fillStyle = '#ffce83'; ctx.fillText(label, lx, ly + 13);
      } else {
        const joints = Object.entries(PARTS).map(([part, config]) => ({ part, point: J[config.joint] }));
        // Paint far handles first so the nearest overlapping joint remains selectable.
        joints.sort((a, b) => V(b.point).distanceTo(editorCamera.position) - V(a.point).distanceTo(editorCamera.position));
        for (const { part, point } of joints) handle(point, "part:" + part, part.startsWith("l") ? "#8edcce" : "#b4c6ef", part === state.part ? 5.5 : 4);
      }
      helper.visible = false;
      grid.visible = false;
      for (const m of meshes) m.material = m.userData.original;
      renderer.setScissorTest(true); renderer.setScissor(r.x, r.y, r.width, r.height); renderer.setViewport(r.x, r.y, r.width, r.height);
      renderer.render(scene, shot); renderer.setScissorTest(false);
      // Keep editor handles out of the actual camera image.
      ctx.clearRect(r.x - 7, height - r.y - r.height - 7, r.width + 14, r.height + 40);
    }
    function render() { if (!scheduled) scheduled = requestAnimationFrame(renderNow); }
    function size() {
      const r = canvas.getBoundingClientRect(); width = r.width; height = r.height;
      cameraEditorFrame = null;
      const dpr = Math.min(devicePixelRatio || 1, 2);
      overlay.width = width * dpr; overlay.height = height * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      renderer?.setSize(width, height, false);
      const [rw, rh] = ratio.split(":").map(Number), aspect = rw > 0 && rh > 0 ? rw / rh : 1;
      const maxW = width < 500 ? 112 : 208, maxH = width < 500 ? 150 : 220;
      const iw = Math.min(maxW, maxH * aspect); inset.style.width = iw + "px"; inset.style.height = iw / aspect + "px";
      render();
    }

    function cameraDescription(l) {
      const [rw, rh] = ratio.split(':').map(Number);
      return M.describeCamera(state.cam, l, state.pose.yaw, M.skeleton(state.pose), rw / rh || 1);
    }
    function output() {
      const l = opts.plang?.() || lang;
      root.querySelector(".cps-out-text").textContent = state.tab === "camera" ? cameraDescription(l) : M.describePose(state.pose, state.cam, l);
    }
    function changed(kind) { if (kind === "pose") state.pose.preset = null; state.cam = M.constrainCamera(state.cam, M.skeleton(state.pose)); sync(); output(); render(); emit(kind); }
    const angle = x => `${Math.round(x)}°`;
    function slider(path, label, min, max, val, hint = "", step = 1, unit = "°") {
      return `<label class="cps-sl"><span class="cps-sl-top"><span>${label}</span><output>${unit === "m" ? val.toFixed(2) + " m" : unit ? angle(val) : val.toFixed(2)}</output></span>
        <input aria-label="${label}" type="range" min="${min}" max="${max}" step="${step}" value="${val}" data-angle="${path}">${hint ? `<small>${hint}</small>` : ""}</label>`;
    }
    function renderPanel() {
      const t = T[lang], text = ui[lang];
      root.querySelectorAll("[data-tab]").forEach(b => { b.textContent = t[b.dataset.tab]; b.setAttribute("aria-selected", b.dataset.tab === state.tab); b.tabIndex = b.dataset.tab === state.tab ? 0 : -1; });
      root.querySelector("[data-reset]").textContent = t.reset;
      root.querySelector(".cps-editor-label").textContent = text.editor;
      root.querySelectorAll("[data-view]").forEach(b => { b.textContent = text[b.dataset.view]; });
      root.querySelectorAll("[data-mode]").forEach(b => { b.textContent = text[b.dataset.mode]; b.setAttribute("aria-pressed", drawing === (b.dataset.mode === "drawing")); });
      root.querySelector(".cps-inset-label").textContent = text.actual;
      root.querySelector(".cps-help").textContent = state.tab === "camera" ? text.cameraHelp : text.fine;
      root.querySelector(".cps-out b").textContent = t.output;
      if (!renderer) status.textContent = text.unsupported;
      if (state.tab === "camera") {
        panel.innerHTML = `<div class="cps-chips"><span>${t.camPresets}</span>${CAM_PRESETS.map((c, i) => `<button type="button" data-campreset="${i}">${c[lang]}</button>`).join("")}</div><div class="cps-focus" role="group" aria-label="${text.focus}"><span>${text.focus}</span>${['head', 'chest', 'whole'].map(f => `<button type="button" data-focus="${f}" aria-pressed="${state.cam.focus === f}">${text[f + 'Target']}</button>`).join('')}</div><div class="cps-sliders">
          ${slider("cam.az", t.az, 0, 359, M.wrap360(state.cam.az - state.pose.yaw), t.azHint)}
          ${slider("cam.el", t.el, -60, 85, state.cam.el, t.elHint + ' · ' + text.floorHint + ': ' + Math.ceil(M.minCameraElevation(state.cam.distance, M.cameraTarget(state.cam, M.skeleton(state.pose)))) + '°', 0.1)}
          ${slider("cam.distance", t.dist, 0.2, 8, state.cam.distance, text.distanceHint, 0.01, "m")}</div>`;
      } else {
        const config = PARTS[state.part];
        panel.innerHTML = `<div class="cps-chips"><span>${t.presets}</span>${PRESETS.map(p => `<button type="button" data-preset="${p.id}" aria-pressed="${state.pose.preset === p.id}">${p[lang]}</button>`).join("")}</div>
          <div class="cps-joint-heading"><span>${text.joints}</span><div><button type="button" data-flip>${text.flip}</button><button type="button" data-mirror="${state.part.startsWith("l") ? "l" : "r"}" ${/^[lr]/.test(state.part) ? "" : "disabled"}>${text.mirror}</button></div></div>
          <div class="cps-parts" role="group" aria-label="${text.selected}">${Object.entries(PARTS).map(([k, p]) => `<button type="button" data-part="${k}" aria-pressed="${k === state.part}">${p[lang]}</button>`).join("")}</div>
          <div class="cps-joint-heading"><strong>${config[lang]}</strong><button type="button" data-reset-part>${text.resetPart}</button></div>
          <div class="cps-sliders">${config.controls.map(c => slider("pose." + c.path, c[lang], c.min, c.max, M.get(state.pose, c.path))).join("")}</div>
          <label class="cps-check"><input type="checkbox" data-seated ${state.pose.seated ? "checked" : ""}> ${t.seated}</label>`;
      }
      output();
    }
    function sync() {
      panel.querySelectorAll("[data-angle]").forEach(input => {
        const path = input.dataset.angle;
        const val = path === "cam.az" ? M.wrap360(state.cam.az - state.pose.yaw) : path.startsWith("cam.") ? state.cam[path.slice(4)] : M.get(state.pose, path.slice(5));
        if (path === 'cam.el') input.closest('label').querySelector('small').textContent = T[lang].elHint + ' · ' + ui[lang].floorHint + ': ' + Math.ceil(M.minCameraElevation(state.cam.distance, M.cameraTarget(state.cam, M.skeleton(state.pose)))) + '°';
        input.value = val; input.closest("label").querySelector("output").textContent = path === "cam.distance" ? val.toFixed(2) + ' m' : angle(val);
      });
      panel.querySelectorAll('[data-focus]').forEach(b => b.setAttribute('aria-pressed', b.dataset.focus === state.cam.focus));
      panel.querySelectorAll("[data-preset]").forEach(b => b.setAttribute("aria-pressed", state.pose.preset === b.dataset.preset));
    }
    function selectPart(part) { state.part = part; renderPanel(); render(); }
    root.addEventListener("click", e => {
      const button = e.target.closest("button"); if (!button) return;
      if (button.dataset.tab) { state.tab = button.dataset.tab; cameraEditorFrame = null; renderPanel(); render(); }
      else if (button.hasAttribute("data-reset")) {
        if (state.tab === "camera") state.cam = M.normalizeCamera({ az: M.wrap360(state.pose.yaw + 45), el: 10, distance: 2.8, focus: "chest" });
        else state.pose = M.normalizePose({ preset: "stand" });
        renderPanel(); render(); emit(state.tab === "camera" ? "cam" : "pose");
      } else if (button.dataset.view) {
        const name = button.dataset.view;
        view = { yaw: state.pose.yaw + ({ front: 0, side: 90, back: 180, frame: 25 }[name]), pitch: name === "frame" ? 12 : 0, dist: 3.8 }; cameraEditorFrame = null; render();
      } else if (button.dataset.mode) {
        drawing = button.dataset.mode === "drawing";
        root.dataset.render = drawing ? "drawing" : "volume";
        root.querySelectorAll("[data-mode]").forEach(b => b.setAttribute("aria-pressed", b === button)); render();
      } else if (button.dataset.focus) {
        state.cam.focus = button.dataset.focus;
        if (state.cam.focus === 'whole') {
          const J = updateFigure(), box = new THREE.Box3().setFromObject(rig), rect = insetRect();
          state.cam.distance = M.fitCameraDistance(state.cam, J, rect.width / rect.height, { min: box.min.toArray(), max: box.max.toArray() });
        }
        cameraEditorFrame = null; changed('cam'); renderPanel();
      } else if (button.dataset.campreset !== undefined) {
        const p = CAM_PRESETS[+button.dataset.campreset]; state.cam = M.normalizeCamera({ ...p.c, az: M.wrap360(p.c.az + state.pose.yaw) });
        if (p.fit) { const J = updateFigure(), box = new THREE.Box3().setFromObject(rig), rect = insetRect(); state.cam.distance = M.fitCameraDistance(state.cam, J, rect.width / rect.height, { min: box.min.toArray(), max: box.max.toArray() }); }
        cameraEditorFrame = null; changed("cam"); renderPanel();
      } else if (button.dataset.preset) {
        state.pose = M.normalizePose({ ...copy(PRESETS.find(p => p.id === button.dataset.preset).pose), preset: button.dataset.preset }); renderPanel(); render(); emit("pose");
      } else if (button.dataset.part) selectPart(button.dataset.part);
      else if (button.hasAttribute("data-reset-part")) {
        const base = M.BASE(); for (const c of PARTS[state.part].controls) M.put(state.pose, c.path, M.get(base, c.path)); changed("pose");
      } else if (button.hasAttribute("data-flip")) {
        for (const kind of ["Arm", "Leg"]) [state.pose["l" + kind], state.pose["r" + kind]] = [state.pose["r" + kind], state.pose["l" + kind]];
        for (const k of ["side", "twist", "pelvisRoll", "headYaw", "headTilt", "neckYaw", "neckTilt"]) state.pose[k] *= -1;
        changed("pose");
      } else if (button.dataset.mirror) {
        const s = button.dataset.mirror, other = s === "l" ? "r" : "l";
        for (const c of PARTS[state.part].controls) M.put(state.pose, other + c.path.slice(1), M.get(state.pose, c.path)); changed("pose");
      }
    });
    root.addEventListener("input", e => {
      const path = e.target.dataset.angle;
      if (path) {
        if (path.startsWith("cam.")) state.cam[path.slice(4)] = path === "cam.az" ? M.wrap360(+e.target.value + state.pose.yaw) : +e.target.value;
        else M.put(state.pose, path.slice(5), +e.target.value);
        changed(path.startsWith("cam.") ? "cam" : "pose");
      } else if (e.target.hasAttribute("data-seated")) { state.pose.seated = e.target.checked; changed("pose"); }
    });
    root.querySelector(".cps-tabs").addEventListener("keydown", e => {
      if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) return;
      e.preventDefault(); state.tab = e.key === "Home" ? "camera" : e.key === "End" ? "pose" : state.tab === "camera" ? "pose" : "camera"; cameraEditorFrame = null;
      renderPanel(); root.querySelector(`[data-tab="${state.tab}"]`).focus(); render();
    });
    const point = e => { const r = canvas.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
    function pick(p) {
      const h = [...handles].reverse().find(h => Math.hypot(h.x - p.x, h.y - p.y) <= h.radius); if (h) return h.id;
      if (state.tab !== "pose") return null;
      raycaster.setFromCamera({ x: p.x / width * 2 - 1, y: 1 - p.y / height * 2 }, editorCamera);
      const hit = raycaster.intersectObjects(meshes.filter(m => m.visible), false)[0];
      if (!hit) return null;
      if (hit.object === continuous.body) {
        const J = M.skeleton(state.pose);
        const closest = Object.entries(PARTS).sort((a, b) => V(J[a[1].joint]).distanceToSquared(hit.point) - V(J[b[1].joint]).distanceToSquared(hit.point))[0];
        return 'part:' + closest[0];
      }
      return 'part:' + hit.object.userData.part;
    }
    canvas.addEventListener("pointerdown", e => {
      if (!renderer || lost || e.button !== 0 || dragging) return;
      const p = point(e), id = pick(p);
      if (id?.startsWith("part:")) selectPart(id.slice(5));
      const h = handles.find(h => h.id === id);
      dragging = { id: id || "orbit", last: p, pointer: e.pointerId, offset: h ? { x: h.x - p.x, y: h.y - p.y } : { x: 0, y: 0 } };
      canvas.setPointerCapture(e.pointerId); canvas.style.cursor = "grabbing"; e.preventDefault();
    });
    function nudge(part, dx, dy) {
      const controls = PARTS[part].controls;
      if (part.endsWith('Fingers')) {
        const arm = state.pose[part[0] + 'Arm'];
        for (const name of ['thumb', 'index', 'middle', 'ring', 'pinky']) arm[name] = clamp(arm[name] - dy * 0.7, 0, name === 'thumb' ? 90 : 100);
        arm.spread = clamp(arm.spread + dx * 0.2, 0, 22); return;
      }
      // Match a drag to the screen-space motion of this joint's descendant. This stays
      // consistent from the front, side and back, including after the body turns.
      const suffix = { Arm: "Elbow", Elbow: "Wrist", Hand: "Hand", Fingers: "Hand", Leg: "Knee", Knee: "Ankle", Foot: "Toe" };
      const endpoint = part === "body" ? "chest" : ["chest", "neck", "head"].includes(part) ? "head" : part[0] + suffix[part.slice(1)];
      const probe = J => part === 'body' ? add(J.chest, mv(J.ubM, [0, 0, 0.15])) : ['chest', 'neck', 'head'].includes(part) ? add(J.head, mv(J.headM, [0, 0, 0.14])) : J[endpoint] || J[PARTS[part].joint];
      const source = M.skeleton(state.pose), tip = probe(source);
      let best = controls[0], bestScore = -1, sign = 1;
      for (const c of controls.slice(0, 3)) {
        const test = copy(state.pose); M.put(test, c.path, M.get(test, c.path) + 2);
        const next = M.skeleton(test), a = project(tip), b = project(probe(next));
        const x = b.x - a.x, y = b.y - a.y, len = Math.hypot(x, y);
        const score = len > 0.01 ? Math.abs((x * dx + y * dy) / len) : -1;
        if (score > bestScore) { best = c; bestScore = score; sign = Math.sign(x * dx + y * dy) || 1; }
      }
      const delta = bestScore < 0.05 ? (Math.abs(dx) > Math.abs(dy) ? dx : -dy) * 0.6 : Math.hypot(dx, dy) * sign * 0.65;
      M.put(state.pose, best.path, clamp(M.get(state.pose, best.path) + delta, best.min, best.max));
    }
    canvas.addEventListener("pointermove", e => {
      const p = point(e);
      if (!dragging) { canvas.style.cursor = pick(p) ? "grab" : "default"; return; }
      if (e.pointerId !== dragging.pointer) return;
      const dx = p.x - dragging.last.x, dy = p.y - dragging.last.y; dragging.last = p;
      if (dragging.id === "orbit") { view.yaw -= dx * 0.4; view.pitch = clamp(view.pitch + dy * 0.3, -25, 80); render(); return; }
      if (dragging.id.startsWith("part:")) { nudge(state.part, dx, dy); changed("pose"); return; }
      const id = dragging.id;
      // Stay on the nearby branch of the projected track. A floor ring can project
      // to almost the same pixel at two very different azimuths; a global search
      // would jump between them. Preserve the initial grab offset as well.
      const target = { x: p.x + dragging.offset.x, y: p.y + dragging.offset.y };
      state.cam[id] = M.dragCameraControl(state.cam, id, target, project, controlCenter); changed("cam");
    });
    const end = e => { if (dragging && e.pointerId === dragging.pointer) { dragging = null; canvas.style.cursor = "default"; } };
    canvas.addEventListener("pointerup", end); canvas.addEventListener("pointercancel", end); canvas.addEventListener("lostpointercapture", end);
    canvas.addEventListener("wheel", e => { e.preventDefault(); view.dist = clamp(view.dist * (1 + Math.sign(e.deltaY) * 0.08), 1.7, 9); render(); }, { passive: false });
    canvas.addEventListener("webglcontextlost", e => { e.preventDefault(); lost = true; status.hidden = false; status.textContent = ui[lang].context; });
    canvas.addEventListener("webglcontextrestored", () => { lost = false; status.hidden = true; render(); });
    state.cam = M.constrainCamera(state.cam, M.skeleton(state.pose));
    const ro = new ResizeObserver(size); ro.observe(canvas); size(); renderPanel();
    return {
      value, set(val = {}) { state.cam = M.normalizeCamera(val.cam); state.pose = M.normalizePose(val.pose); state.cam = M.constrainCamera(state.cam, M.skeleton(state.pose)); cameraEditorFrame = null; renderPanel(); render(); },
      setLang(l) { lang = l; renderPanel(); }, setRatio(r) { ratio = r; size(); }, refresh() { size(); output(); },
      describe(l) { return { camera: cameraDescription(l), pose: M.describePose(state.pose, state.cam, l) }; },
      destroy() { ro.disconnect(); cancelAnimationFrame(scheduled); const geometries = new Set(), materials = new Set(); scene.traverse(o => { if (o.geometry) geometries.add(o.geometry); if (o.material) materials.add(o.material); }); geometries.forEach(g => g.dispose()); materials.forEach(m => m.dispose()); continuous.skeleton.dispose(); skin.dispose(); selected.dispose(); renderer?.dispose(); root.replaceChildren(); }
    };
  }
  return { create, describeCamera: M.describeCamera, describePose: M.describePose, PRESETS };
})();
