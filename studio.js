/* True 3D pose studio. All angles, persisted values and prompt words share studio-model.js. */
const CamPose = (() => {
  const M = CamPoseModel;
  const { D2R, clamp, add, sub, mul, mv, B, PARTS, PRESETS, T, CAM_PRESETS } = M;
  // Seat surface where the seated mesh's buttocks actually rest (measured: about 6 cm below the
  // skeleton's seat height), so the body sits on the seat instead of sinking into it.
  const SEAT_TOP = B.seat - 0.058;
  // Front-view body map for picking a joint (viewBox 120 x 240; the subject's left is on the right).
  const BODY_MAP = {
    head: [60, 20], neck: [60, 41], chest: [60, 70], body: [60, 108],
    lArm: [82, 52], rArm: [38, 52], lElbow: [91, 86], rElbow: [29, 86], lHand: [97, 118], rHand: [23, 118], lFingers: [100, 135], rFingers: [20, 135],
    lLeg: [72, 124], rLeg: [48, 124], lKnee: [73, 170], rKnee: [47, 170], lFoot: [75, 216], rFoot: [45, 216]
  };
  const V = p => new THREE.Vector3(...p);
  const identity = [1, 0, 0, 0, 1, 0, 0, 0, 1];
  const copy = x => JSON.parse(JSON.stringify(x));
  const ui = {
    en: {
      editor: "Studio view · drag background to orbit", actual: "CAMERA VIEW", front: "Front", side: "Right", back: "Back", frame: "Fit scene",
      selected: "Selected joint", resetPart: "Reset joint", mirror: "Mirror joint", flip: "Swap sides", joints: "18 parts · 54 angle controls", pagePoses: "Poses", stool: "On a stool", posesLabel: "Pose", simpleMode: "Simple mode", rotateHint: "Tip: turn your phone sideways — the 3D studio is easier in landscape.", fullscreen: "Full screen", railPrev: "Previous options", railNext: "More options", gaze: "Gaze", gazeCamera: "Camera", gazeOther: "Other", gazePick: "Pointer", gazePicking: "Drag in 3D…", gazeAhead: "Ahead", lens: "Lens (mm)", lensAuto: "Auto", facing: "Facing", faceFront: "Front", faceRight: "Right side", faceBack: "Back", faceLeft: "Left side", turnLabel: "Turn the figure", turnHint: "Or drag the dot on the orange ring at the feet; drag the ring itself to move the figure", pageFigure: "Body type", pageJoints: "Joints", mapLeft: "L", mapRight: "R",
      fine: "Select a joint or body surface. Drag to pose; use sliders or arrow keys for precise angles.",
      cameraHelp: "Yellow is the actual camera: drag it closer, through the pink reference arc. Green: orbit · pink: elevation. The target marker shows where the camera aims.",
      unsupported: "This browser could not start 3D. Enable WebGL or try another browser. Angle controls and prompt output still work.",
      context: "3D paused. Restoring the graphics context…", restored: "3D restored", both: "Both sides", left: "Left to right", right: "Right to left", volume: "3D form", drawing: "Study lines", finish: "Mannequin finish", finish_clay: "Clay", finish_wood: "Wood", finish_skin: "Skin", focus: "Look at", headTarget: "Head", chestTarget: "Chest", wholeTarget: "Whole body", target: "Aim", distanceHint: "Actual camera distance in metres · 0.20–15.00 m", floorHint: "Lowest angle at this distance",
      light: "Light", lightHelp: "Drag the sun to move the key light. Words describe the light as seen from the camera.", lightAz: "Light direction", lightAzHint: "0° = from the camera · 90° = from the frame's left · 180° = from behind", lightEl: "Light height", lightElHint: "low = long shadows · high = top light", soft: "Soft light", hard: "Hard light", lightPresets: "Lighting",
      body: "Body type", props: "Props", people: "Models", personA: "A", personB: "B", addPerson: "+ Model", removePerson: "Remove B", model: "Model", posX: "Position left / right", posZ: "Position front / back", spacing: "Distance between models", spacingHint: "Metres between body centres · moves A and B equally", regrip: "Reset grip",
      download: "Download camera view", downloaded: "Saved", ikHint: "Drag a wrist, hand or ankle: the whole arm or leg follows."
    },
    zh: {
      editor: "工作视图 · 拖动空白处旋转", actual: "实际镜头画面", front: "正面", side: "右侧", back: "背面", frame: "查看整个场景",
      selected: "当前关节", resetPart: "重置此部位", mirror: "镜像此部位", flip: "左右互换", joints: "18 个部位 · 54 项角度控制", pagePoses: "姿势", stool: "坐凳子", posesLabel: "姿势", simpleMode: "简化模式", rotateHint: "建议横屏使用 3D 工作室，操作更顺手。", fullscreen: "全屏", railPrev: "上一组选项", railNext: "更多选项", gaze: "视线", gazeCamera: "看镜头", gazeOther: "看对方", gazePick: "跟着鼠标", gazePicking: "在画面上拖动…", gazeAhead: "正前方", lens: "镜头 (mm)", lensAuto: "自动", facing: "人物朝向", faceFront: "正面", faceRight: "右侧", faceBack: "背面", faceLeft: "左侧", turnLabel: "旋转人物", turnHint: "也可以拖动脚下橙色圆圈上的圆点；拖动圆圈本身可以移动人物", pageFigure: "体型", pageJoints: "关节", mapLeft: "左", mapRight: "右",
      fine: "点选关节点或人物表面，拖动调整姿势；滑块和方向键可精确调角度。",
      cameraHelp: "黄色就是真实相机，可穿过粉色参考弧继续靠近。绿色调方位，粉色调仰俯；瞄准点标出实际朝向。",
      unsupported: "浏览器无法启动 3D，请启用 WebGL 或换一个浏览器。角度控制和提示词仍可使用。",
      context: "3D 暂停，正在恢复图形显示…", restored: "3D 已恢复", both: "左右两侧", left: "左侧复制到右侧", right: "右侧复制到左侧", volume: "立体素体", drawing: "绘画线稿", finish: "素体材质", finish_clay: "陶土", finish_wood: "木质", finish_skin: "肤色", focus: "镜头瞄准", headTarget: "头部", chestTarget: "胸部", wholeTarget: "全身取景", target: "瞄准", distanceHint: "真实相机距离，单位为米 · 0.20–15.00 m", floorHint: "当前距离的最低角度",
      light: "光线", lightHelp: "拖动太阳移动主光。描述按镜头看到的效果来写。", lightAz: "光的方向", lightAzHint: "0° = 从镜头方向 · 90° = 从画面左边 · 180° = 从背后", lightEl: "光的高度", lightElHint: "低 = 影子长 · 高 = 顶光", soft: "柔光", hard: "硬光", lightPresets: "常用光线",
      body: "体型", props: "道具", people: "素体", personA: "A", personB: "B", addPerson: "+ 素体", removePerson: "移除 B", model: "素体", posX: "位置 左右", posZ: "位置 前后", spacing: "两人间距", spacingHint: "身体中心之间的距离（米）· 同时移动 A、B", regrip: "重新握持",
      download: "下载镜头画面", downloaded: "已保存", ikHint: "拖动手腕、手或脚踝，整条手臂或腿会自动跟着弯。"
    }
  };

  function create(root, opts = {}) {
    let lang = opts.lang || "en", ratio = opts.ratio || "1:1";
    // Props were removed from the studio: any pose that arrives with them (old links, saved scenes) drops them.
    const loadPose = raw => { const p = M.migratePose(raw); p.props = []; return p; };
    const defaultPose2 = () => M.normalizePose({ preset: "stand", x: 0.85, z: 0.15, yaw: 60 });
    let state = {
      tab: "camera", cam: M.normalizeCamera(opts.value?.cam), pose: loadPose(opts.value?.pose || { preset: "stand" }), part: "rArm",
      pose2: opts.value?.pose2 ? loadPose(opts.value.pose2) : defaultPose2(), second: opts.value?.second === true,
      light: M.normalizeLight(opts.value?.light), editing: "a"
    };
    // The pose being edited (model A or B).
    const cur = () => (state.editing === "b" && state.second ? state.pose2 : state.pose);
    let view = { yaw: 25, pitch: 12, dist: 3.8 };
    let presetGlide = 0, ringPts = [], gazePick = false;
    // Simple mode (handy on phones): presets, camera angles and the turn ring only; no joint editing.
    let simple = false;
    try { simple = localStorage.getItem("promptlab.simple") === "1"; } catch (e) {}
    // Where each figure is looking: null (free), "camera", "other", "ahead" or { point } — camera / other keep following.
    const gaze = { a: null, b: null }, gazeCache = { a: "", b: "" };
    let width = 0, height = 0, handles = [], dragging = null, scheduled = 0, lost = false, drawing = false;
    let cameraEditorFrame = null, controlCenter = [0, 1, 0];
    root.classList.add("cps");
    root.innerHTML = `
      <div class="cps-left">
        <div class="cps-rotate" hidden><span class="cps-rotate-text"></span><button type="button" data-fullscreen></button><button type="button" data-rotate-close aria-label="Close">×</button></div>
        <div class="cps-view-tools"><span class="cps-editor-label"></span><button type="button" class="cps-simple-btn" data-simple aria-pressed="false"></button><div>
          <button type="button" data-view="front"></button><button type="button" data-view="side"></button><button type="button" data-view="back"></button><button type="button" data-view="frame"></button>
        </div><div class="cps-render-modes"><button type="button" data-mode="volume" aria-pressed="true"></button><button type="button" data-mode="drawing" aria-pressed="false"></button></div><div class="cps-render-modes cps-finishes" role="group"><button type="button" data-finish="clay"></button><button type="button" data-finish="wood"></button><button type="button" data-finish="skin"></button></div><button type="button" class="cps-download" data-download></button></div>
      <div class="cps-stage fresh">
        <canvas class="cps-main" aria-label="Interactive 3D pose studio"></canvas><canvas class="cps-overlay" aria-hidden="true"></canvas>
        <div class="cps-status" role="status" hidden></div><div class="cps-help"></div>
      </div>
      <div class="cps-out"><b></b><span class="cps-out-text" aria-live="polite"></span></div>
      </div>
      <div class="cps-right">
        <div class="cps-top"><div class="cps-tabs" role="tablist" aria-label="3D studio">
        <button type="button" role="tab" data-tab="camera"></button><button type="button" role="tab" data-tab="pose"></button><button type="button" role="tab" data-tab="light"></button>
      </div><button type="button" class="cps-reset" data-reset></button></div>
      <details class="cps-preview" open><summary><span class="cps-inset-label"></span><span class="cps-preview-chevron" aria-hidden="true">⌄</span></summary><div class="cps-preview-body"><canvas class="cps-inset-preview" aria-label="Actual camera preview"></canvas></div></details>
      <div class="cps-panel" role="tabpanel"></div>
      </div>`;
    const canvas = root.querySelector(".cps-main"), overlay = root.querySelector(".cps-overlay"), panel = root.querySelector(".cps-panel");
    const inset = root.querySelector(".cps-inset-preview"), preview = root.querySelector('.cps-preview'), previewCtx = inset.getContext('2d'), ctx = overlay.getContext("2d"), status = root.querySelector(".cps-status");
    let previewWidth = 180, previewHeight = 180;
    const value = () => ({ cam: { ...state.cam }, pose: copy(state.pose), pose2: copy(state.pose2), second: state.second, light: { ...state.light } });
    const emit = kind => opts.onChange?.(value(), kind);
    let renderer;
    try {
      renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
      renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFShadowMap;
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
    key.shadow.bias = -0.0008; key.shadow.normalBias = 0.035;
    Object.assign(key.shadow.camera, { left: -3.2, right: 3.2, top: 3.4, bottom: -2.4 });
    scene.add(key); scene.add(key.target);
    const rim = new THREE.DirectionalLight(0x9bbaff, 2.7); rim.position.set(3, 3, -3); scene.add(rim);
    const fill = new THREE.DirectionalLight(0xffddc3, 0.8); fill.position.set(3, 1, 3); scene.add(fill);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), new THREE.MeshStandardMaterial({ color: 0x080c13, roughness: 0.98 }));
    floor.rotation.x = -Math.PI / 2; floor.position.y = -0.008; floor.receiveShadow = true; scene.add(floor);
    const grid = new THREE.GridHelper(10, 40, 0x465369, 0x273140); grid.position.y = -0.005; grid.material.transparent = true; scene.add(grid);
    const helper = new THREE.Group(); scene.add(helper);
    // All figures live in `cast`; `rig` is the main figure (A). A second person (B) is optional.
    const cast = new THREE.Group(); scene.add(cast);
    const skin = new THREE.MeshStandardMaterial({ color: 0xc6b6a2, roughness: 0.65, metalness: 0 });
    // Mannequin finishes: matte clay (default), warm wood with a soft grain, or realistic skin tone.
    // Model B keeps a slightly different tone in each finish so the two people stay easy to tell apart.
    const FINISH = {
      clay: { a: 0xcdc8c0, b: 0xb3bcc8, roughness: 0.9, grain: false },
      wood: { a: 0xd9a46e, b: 0xa88a74, roughness: 0.55, grain: true },
      skin: { a: 0xc6b6a2, b: 0xa9b3c2, roughness: 0.65, grain: false }
    };
    let finish = "clay";
    try { const saved = localStorage.getItem("promptlab.finish"); if (FINISH[saved]) finish = saved; } catch (e) {}
    const pageDark = () => (document.documentElement.dataset.theme || (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light")) === "dark";
    const selected = new THREE.MeshStandardMaterial({ color: 0xe0b6a1, roughness: 0.6, emissive: 0x572513, emissiveIntensity: 0.15 });
    const skin2 = new THREE.MeshStandardMaterial({ color: 0xa9b3c2, roughness: 0.65, metalness: 0 });
    const propMat = new THREE.MeshStandardMaterial({ color: 0x596271, metalness: 0.3, roughness: 0.6 });
    const darkMat = new THREE.MeshStandardMaterial({ color: 0x1d2027, roughness: 0.35, metalness: 0.4 });
    const bookMat = new THREE.MeshStandardMaterial({ color: 0x7b3b2a, roughness: 0.7 });
    const cupMat = new THREE.MeshStandardMaterial({ color: 0xf1ede4, roughness: 0.4 });
    const woodMat = new THREE.MeshStandardMaterial({ color: 0x8a6a4c, roughness: 0.75 });
    const umbrellaMat = new THREE.MeshStandardMaterial({ color: 0x9e2a2b, roughness: 0.6, side: THREE.DoubleSide });
    const meshes = [];
    let build = null; // the figure being constructed
    const outlines = [], construction = [];
    const ink = new THREE.MeshBasicMaterial({ color: 0x292d33, side: THREE.BackSide });

    function group(name, part = name) { const g = new THREE.Group(); g.userData.part = part; build.nodes[name] = g; build.rig.add(g); return g; }
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
    const headProfile = [[-0.127, 0.018, 0.032, 0.022], [-0.112, 0.047, 0.056, 0.019], [-0.075, 0.069, 0.077, 0.008], [-0.035, 0.083, 0.088], [0.015, 0.09, 0.095], [0.065, 0.085, 0.087, -0.006], [0.103, 0.064, 0.066, -0.007], [0.126, 0.025, 0.031], [0.13, 0.001, 0.001]];
    function makeFigure(id, material) {
    build = { id, skin: material, rig: new THREE.Group(), nodes: {} };
    const { nodes, rig } = build;
    const pelvis = group("pelvis", "body");
    const torso = group("torso", "chest");
    const head = group("head");
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

    for (const side of ["l", "r"]) group(side + "Hand", side + "Hand");
    const stool = new THREE.Group(); rig.add(stool);
    const seat = new THREE.Mesh(new THREE.CylinderGeometry(0.205, 0.205, 0.055, 40), propMat); seat.position.set(0, SEAT_TOP - 0.0275, -0.06); seat.castShadow = true; stool.add(seat);
    for (const x of [-0.135, 0.135]) for (const z of [-0.19, 0.07]) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.017, 0.023, 1, 12), propMat); leg.position.set(x, (SEAT_TOP - 0.055) / 2, z); leg.scale.y = SEAT_TOP - 0.055; leg.castShadow = true; stool.add(leg);
    }
    const props = makeProps(nodes, rig);

    // The body and fingers are a single anatomical skinned surface.
    const continuous = StudioSurface.create(M, material, rig);
    continuous.body.userData = { part: 'surface', original: material, figure: id }; meshes.push(continuous.body);
    const surfaceOutline = new THREE.SkinnedMesh(continuous.geometry, ink);
    rig.add(surfaceOutline); surfaceOutline.bind(continuous.skeleton, continuous.body.bindMatrix);
    surfaceOutline.scale.setScalar(1.003); surfaceOutline.visible = false; outlines.push(surfaceOutline);
    return { id, rig, nodes, stool, props, continuous, surfaceOutline, J: null };
    }

    // Every joint of a skeleton plus points along each limb, used to keep furniture out of bodies.
    function bodyPoints(J) {
      const pts = Object.entries(J).filter(([k, v]) => !/forward/i.test(k) && Array.isArray(v) && v.length === 3 && v.every(Number.isFinite)).map(([, v]) => v);
      for (const s of ["l", "r"]) for (const [a, b] of [["Hip", "Knee"], ["Knee", "Ankle"], ["Ankle", "Toe"], ["Shoulder", "Elbow"], ["Elbow", "Wrist"]]) {
        const A = J[s + a], C = J[s + b]; if (!A || !C) continue;
        for (const t of [0.25, 0.5, 0.75]) pts.push(A.map((v, i) => v + (C[i] - v) * t));
      }
      return pts;
    }
    const rotation = new THREE.Matrix4();
    function place(fig, name, p, m = identity, scale = 1) {
      const node = fig.nodes[name]; node.position.set(...p);
      rotation.set(m[0], m[1], m[2], 0, m[3], m[4], m[5], 0, m[6], m[7], m[8], 0, 0, 0, 0, 1);
      node.quaternion.setFromRotationMatrix(rotation); node.scale.setScalar(scale);
    }
    function poseFigure(fig, p, others = []) {
      const requested = JSON.stringify(p), othersKey = JSON.stringify(others);
      if (fig.poseKey === requested && fig.othersKey === othersKey) return fig.J;
      if (fig.poseKey === requested) { fig.props.update(fig.J, p, others, fig.seatHeight); fig.othersKey = othersKey; return fig.J; }
      if (p.seated) {
        const standing = M.skeleton({ ...p, seated: false });
        if (standing.pelvis[1] / standing.scale > B.seat + 0.12) p.seated = false;
      }
      // A real arm cannot pass through the body: push it just clear before drawing (updates the pose).
      M.resolveArms(p, { previous: fig.safePose });
      const J = M.skeleton(p), h = J.scale;
      place(fig, "pelvis", J.pelvis, J.bodyM, h); place(fig, "torso", J.waist, J.ubM, h * M.measurements(p.body).spine / B.spine); place(fig, "head", J.head, J.headM, J.headSize);
      for (const side of ["l", "r"]) place(fig, side + "Hand", J[side + "Wrist"], J[side + "HandM"], J.handSize);
      const chair = (p.props || []).includes("chair");
      fig.stool.visible = p.seated && !chair;
      fig.stool.position.set(p.x || 0, 0, p.z || 0); fig.stool.scale.setScalar(h);
      fig.stool.rotation.y = Math.atan2(J.forward[0], J.forward[2]);
      fig.continuous.update(J, p);
      const seatHeight = p.seated ? fig.continuous.seatSupport(J, chair) : SEAT_TOP * h;
      fig.stool.children[0].position.y = seatHeight / h - 0.0275;
      for (const leg of fig.stool.children.slice(1)) { leg.scale.y = seatHeight / h - 0.055; leg.position.y = leg.scale.y / 2; }
      fig.props.update(J, p, others, seatHeight);
      if (fig.surfaceOutline.geometry !== fig.continuous.geometry) {
        fig.surfaceOutline.geometry = fig.continuous.geometry;
        fig.surfaceOutline.bind(fig.continuous.skeleton, fig.continuous.body.bindMatrix);
      }
      fig.continuous.body.computeBoundingBox(); fig.continuous.body.computeBoundingSphere();
      fig.surfaceOutline.boundingBox = fig.continuous.body.boundingBox.clone().expandByScalar(0.005);
      fig.surfaceOutline.boundingSphere = fig.continuous.body.boundingSphere.clone(); fig.surfaceOutline.boundingSphere.radius += 0.005;
      fig.J = J;
      fig.poseKey = JSON.stringify(p); fig.othersKey = othersKey;
      fig.seatHeight = seatHeight;
      fig.safePose = copy(p);
      if (fig.poseKey !== requested) { sync(); output(); }
      return J;
    }
    function gazeButtons() {
      const text = ui[lang], mode = gaze[state.editing === "b" && state.second ? "b" : "a"];
      const on = k => k === "pick" ? gazePick || (mode && typeof mode === "object") : mode === k;
      return [["camera", text.gazeCamera], ...(state.second ? [["other", text.gazeOther]] : []), ["pick", gazePick ? text.gazePicking : text.gazePick], ["ahead", text.gazeAhead]]
        .map(([k, label]) => `<button type="button" data-gaze="${k}" aria-pressed="${!!on(k)}">${label}</button>`).join("");
    }
    const gazeKey = (pose, target) => { const { neckYaw, headYaw, neckPitch, headPitch, neckTilt, headTilt, preset, ...rest } = pose; return JSON.stringify([target.map(v => Math.round(v * 200)), rest]); };
    function aimGaze() {
      for (const id of state.second ? ["a", "b"] : ["a"]) {
        const mode = gaze[id]; if (!mode || mode === "ahead") continue;
        const pose = id === "b" ? state.pose2 : state.pose, other = id === "b" ? state.pose : state.pose2;
        const target = mode === "camera" ? M.shotCamera(state.cam, M.skeleton(state.pose)).pos : mode === "other" ? (state.second ? M.skeleton(other).head : null) : mode.point;
        if (!target) continue;
        const key = gazeKey(pose, target);
        if (key === gazeCache[id]) continue;
        const before = [pose.neckYaw, pose.headYaw, pose.neckPitch, pose.headPitch].join();
        M.lookAt(pose, target); gazeCache[id] = key;
        // The head now differs from the preset, so describe the actual pose.
        if ([pose.neckYaw, pose.headYaw, pose.neckPitch, pose.headPitch].join() !== before) pose.preset = null;
      }
    }
    function updateFigure() {
      aimGaze();
      const J = poseFigure(figA, state.pose, state.second ? [M.skeleton(state.pose2)] : []);
      if (state.second) { if (figB.rig.parent !== cast) cast.add(figB.rig); poseFigure(figB, state.pose2, [J]); }
      else if (figB.rig.parent === cast) cast.remove(figB.rig);
      cast.updateMatrixWorld(true); return J;
    }
    function figureBounds() {
      const bounds = new THREE.Box3();
      cast.traverseVisible(obj => {
        if (!obj.isMesh) return;
        if (obj.isSkinnedMesh && !obj.boundingBox) obj.computeBoundingBox();
        else if (!obj.geometry.boundingBox) obj.geometry.computeBoundingBox();
        const local = obj.isSkinnedMesh ? obj.boundingBox : obj.geometry.boundingBox;
        bounds.union(local.clone().applyMatrix4(obj.matrixWorld));
      });
      return bounds;
    }

    // Props: hand-held items follow the right hand; furniture follows the body's position and turn.
    function makeProps(nodes, rig) {
      const box = (w, h, d, mat) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.castShadow = true; m.receiveShadow = true; return m; };
      const items = {};
      // A slab with rounded corners and softly bevelled edges, centred on the origin (w along x, h along y, d along z).
      const slab = (w, h, d, r, mat, bevel = Math.min(d * 0.3, 0.003)) => {
        const x = w / 2 - bevel, y = h / 2 - bevel, c = Math.max(0.0005, Math.min(r, x, y)), shape = new THREE.Shape();
        shape.moveTo(-x + c, -y); shape.lineTo(x - c, -y); shape.quadraticCurveTo(x, -y, x, -y + c); shape.lineTo(x, y - c); shape.quadraticCurveTo(x, y, x - c, y);
        shape.lineTo(-x + c, y); shape.quadraticCurveTo(-x, y, -x, y - c); shape.lineTo(-x, -y + c); shape.quadraticCurveTo(-x, -y, -x + c, -y);
        const geo = new THREE.ExtrudeGeometry(shape, { depth: Math.max(0.0002, d - 2 * bevel), bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 3, curveSegments: 8 });
        geo.translate(0, 0, -(d - 2 * bevel) / 2); geo.computeVertexNormals();
        const m = new THREE.Mesh(geo, mat); m.castShadow = true; m.receiveShadow = true; return m;
      };
      items.phone = new THREE.Group();
      const frameMat = new THREE.MeshStandardMaterial({ color: 0x2b2f36, roughness: 0.35, metalness: 0.6 });
      items.phone.add(slab(0.071, 0.147, 0.0085, 0.011, frameMat));
      const screen = slab(0.065, 0.141, 0.0008, 0.009, new THREE.MeshStandardMaterial({ color: 0x0e1622, roughness: 0.12, metalness: 0.2 }), 0.0002); screen.position.z = -0.0044; items.phone.add(screen);
      const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.0055, 0.0055, 0.0016, 20), frameMat); lens.rotation.x = Math.PI / 2; lens.position.set(-0.021, 0.057, 0.0048); items.phone.add(lens);
      // A hardback: two covers, a cream page block set back from the edges, and a rounded spine.
      items.book = new THREE.Group();
      for (const z of [-0.0115, 0.0115]) { const cover = slab(0.16, 0.222, 0.003, 0.004, bookMat, 0.001); cover.position.z = z; items.book.add(cover); }
      const pages = slab(0.152, 0.212, 0.020, 0.002, cupMat, 0.001); pages.position.x = 0.002; items.book.add(pages);
      const spine = new THREE.Mesh(new THREE.CylinderGeometry(0.0128, 0.0128, 0.222, 18, 1, false, Math.PI, Math.PI), bookMat);
      spine.position.x = -0.079; spine.castShadow = true; items.book.add(spine);
      items.cup = new THREE.Group();
      const wall = new THREE.Mesh(new THREE.CylinderGeometry(0.038, 0.032, 0.10, 36, 1, true), cupMat); wall.castShadow = true; items.cup.add(wall);
      const rim = new THREE.Mesh(new THREE.TorusGeometry(0.0375, 0.0022, 8, 36), cupMat); rim.rotation.x = Math.PI / 2; rim.position.y = 0.05; items.cup.add(rim);
      const coffee = new THREE.Mesh(new THREE.CircleGeometry(0.035, 36), new THREE.MeshStandardMaterial({ color: 0x332013, roughness: 0.5 })); coffee.rotation.x = -Math.PI / 2; coffee.position.y = 0.034; items.cup.add(coffee);
      const cupHandle = new THREE.Mesh(new THREE.TorusGeometry(0.022, 0.006, 10, 24), cupMat); cupHandle.position.set(-0.052, 0.005, 0); cupHandle.castShadow = true; items.cup.add(cupHandle);
      items.umbrella = new THREE.Group();
      const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.95, 10), darkMat); shaft.position.y = 0.43; shaft.castShadow = true;
      const canopy = new THREE.Mesh(new THREE.ConeGeometry(0.55, 0.23, 16, 1, true), umbrellaMat); canopy.position.y = 0.95; canopy.castShadow = true;
      const handleBit = new THREE.Mesh(new THREE.TorusGeometry(0.025, 0.007, 8, 20, Math.PI), darkMat); handleBit.position.set(0.025, -0.045, 0); handleBit.rotation.z = Math.PI;
      const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.009, 0.105, 20), darkMat); grip.castShadow = true;
      items.umbrella.add(shaft, canopy, handleBit, grip);
      for (const k of Object.keys(M.PROP_ATTACHMENTS)) rig.add(items[k]);
      items.chair = new THREE.Group(); {
        const seatTop = box(0.44, 0.045, 0.42, woodMat); seatTop.position.y = SEAT_TOP - 0.0225;
        const back = box(0.44, 0.46, 0.035, woodMat); back.position.set(0, SEAT_TOP + 0.23, -0.2);
        items.chair.add(seatTop, back);
        for (const x of [-0.19, 0.19]) for (const z of [-0.18, 0.18]) { const l = box(0.035, SEAT_TOP - 0.045, 0.035, woodMat); l.position.set(x, (SEAT_TOP - 0.045) / 2, z); items.chair.add(l); }
      } rig.add(items.chair);
      items.table = new THREE.Group(); {
        const top = box(0.95, 0.04, 0.6, woodMat); top.position.y = 0.74; items.table.add(top);
        for (const x of [-0.42, 0.42]) for (const z of [-0.25, 0.25]) { const l = box(0.04, 0.72, 0.04, woodMat); l.position.set(x, 0.36, z); items.table.add(l); }
      } rig.add(items.table);
      function update(J, p, others = [], seatHeight = SEAT_TOP * J.scale) {
        const on = new Set(p.props || []), yaw = Math.atan2(J.forward[0], J.forward[2]);
        for (const [k, g] of Object.entries(items)) g.visible = on.has(k);
        for (const k of Object.keys(M.PROP_ATTACHMENTS)) {
          const frame = M.propFrame(p, k, J), R = frame.matrix;
          items[k].position.set(...frame.position); items[k].scale.setScalar(frame.scale);
          rotation.set(R[0], R[1], R[2], 0, R[3], R[4], R[5], 0, R[6], R[7], R[8], 0, 0, 0, 0, 1);
          items[k].quaternion.setFromRotationMatrix(rotation);
        }
        // The chair sits under a seated figure; otherwise it goes beside them and the table in front,
        // at the first spot where neither this body nor the other model passes through the furniture.
        const local = (x, z) => [(p.x || 0) + Math.cos(yaw) * x + Math.sin(yaw) * z, 0, (p.z || 0) - Math.sin(yaw) * x + Math.cos(yaw) * z];
        const bodies = [J, ...others].map(bodyPoints).flat();
        const clearance = (at, half, height) => {
          let best = Infinity;
          for (const q of bodies) {
            if (q[1] > height) continue;
            const dx = q[0] - at[0], dz = q[2] - at[2], u = Math.abs(Math.cos(yaw) * dx - Math.sin(yaw) * dz) - half[0], v = Math.abs(Math.sin(yaw) * dx + Math.cos(yaw) * dz) - half[1];
            best = Math.min(best, Math.hypot(Math.max(u, 0), Math.max(v, 0)) - (u < 0 && v < 0 ? Math.min(-u, -v) : 0));
          }
          return best;
        };
        const choose = (spots, half, height, used = []) => {
          let pick = null, score = -Infinity;
          for (const [x, z] of spots) {
            const at = local(x, z); if (used.some(u => Math.hypot(u[0] - at[0], u[2] - at[2]) < 0.75)) continue;
            const c = clearance(at, half, height); if (c > 0.12) return at;
            if (c > score) { score = c; pick = at; }
          }
          return pick || local(...spots[0]);
        };
        const chairAt = p.seated ? local(0, -0.04) : choose([[0.62, -0.05], [-0.62, -0.05], [0.6, -0.55], [-0.6, -0.55], [0, -0.75], [0.85, 0.25], [-0.85, 0.25], [0.95, -0.5], [-0.95, -0.5], [0, -1.1], [1.25, 0], [-1.25, 0]], [0.25, 0.25], 1.0);
        items.chair.position.set(...chairAt); items.chair.rotation.y = yaw; items.chair.scale.setScalar(p.seated ? J.scale : 1);
        const seatTop = p.seated ? seatHeight / J.scale : SEAT_TOP;
        items.chair.children[0].position.y = seatTop - 0.0225;
        items.chair.children[1].position.y = seatTop + 0.23;
        for (const leg of items.chair.children.slice(2)) { leg.scale.y = (seatTop - 0.045) / (SEAT_TOP - 0.045); leg.position.y = (seatTop - 0.045) / 2; }
        const tableAt = choose([[0, p.seated ? 0.5 : 0.55], [0, 0.75], [0, 0.95], [0.9, 0.5], [-0.9, 0.5], [0, 1.25]], [0.5, 0.32], 0.8, on.has("chair") && !p.seated ? [chairAt] : []);
        items.table.position.set(...tableAt); items.table.rotation.y = yaw;
      }
      return { update };
    }
    const figA = makeFigure("a", skin), rig = figA.rig; cast.add(rig);
    const figB = makeFigure("b", skin2);
    // The joint picker uses the same anatomical body as the stage, in a fixed front
    // view. Cache one small image per build so dragging joints needs no extra draw.
    const bodyMapCache = new Map();
    let mapRig, mapSurface, mapScene, mapCamera, mapTarget, mapMaterial;
    function updateBodyMap() {
      const mapCanvas = panel.querySelector('.cps-map canvas');
      if (!mapCanvas || !renderer) return;
      const type = cur().body;
      if (!bodyMapCache.has(type)) {
        if (!mapSurface) {
          mapScene = new THREE.Scene(); mapRig = new THREE.Group(); mapScene.add(mapRig);
          mapMaterial = new THREE.MeshStandardMaterial({ color: 0xc8c2b8, roughness: 0.7 });
          mapSurface = StudioSurface.create(M, mapMaterial, mapRig);
          mapScene.add(new THREE.HemisphereLight(0xf1f2f4, 0x6b6260, 2));
          const light = new THREE.DirectionalLight(0xffedd7, 3); light.position.set(-2, 4, 4); mapScene.add(light);
          const fill = new THREE.DirectionalLight(0xc2d7ee, 1); fill.position.set(2, 1, 2); mapScene.add(fill);
          mapCamera = new THREE.OrthographicCamera(-0.5, 0.5, 1, -1, 0.1, 10);
          mapTarget = new THREE.WebGLRenderTarget(192, 384);
          mapTarget.texture.colorSpace = THREE.SRGBColorSpace;
        }
        const pose = M.P({ body: type, lArm: { a: 18, c: 6 }, rArm: { a: 18, c: 6 } }), J = M.skeleton(pose);
        mapSurface.update(J, pose); mapSurface.body.computeBoundingBox();
        const box = mapSurface.body.boundingBox, size = box.getSize(new THREE.Vector3()), center = box.getCenter(new THREE.Vector3());
        const H = Math.max(size.y * 1.08, size.x * 2.12), W = H / 2;
        Object.assign(mapCamera, { left: -W / 2, right: W / 2, top: H / 2, bottom: -H / 2 });
        mapCamera.position.set(center.x, center.y, 3); mapCamera.lookAt(center); mapCamera.updateProjectionMatrix(); mapCamera.updateMatrixWorld();
        const oldTarget = renderer.getRenderTarget(), oldColor = renderer.getClearColor(new THREE.Color()), oldAlpha = renderer.getClearAlpha();
        renderer.setRenderTarget(mapTarget); renderer.setScissorTest(false); renderer.setClearColor(0x000000, 0); renderer.clear(); renderer.render(mapScene, mapCamera);
        const pixels = new Uint8Array(192 * 384 * 4); renderer.readRenderTargetPixels(mapTarget, 0, 0, 192, 384, pixels);
        renderer.setRenderTarget(oldTarget); renderer.setClearColor(oldColor, oldAlpha);
        const image = new ImageData(192, 384);
        for (let y = 0; y < 384; y++) image.data.set(pixels.subarray((383 - y) * 192 * 4, (384 - y) * 192 * 4), y * 192 * 4);
        const points = Object.fromEntries(Object.entries(PARTS).map(([name, part]) => {
          const q = V(J[part.joint]).project(mapCamera); return [name, [(q.x + 1) * 50, (1 - q.y) * 50]];
        }));
        // Some joints nearly coincide on the map (neck / chest, pelvis / hips, wrist / fingers). Push
        // the dots apart until each 24 px button is clear of the others (map is about 118 x 236 px).
        const px = [1.18, 2.36], gap = 23, names = Object.keys(points);
        for (let it = 0; it < 60; it++) {
          let moved = false;
          for (let i = 0; i < names.length; i++) for (let j = i + 1; j < names.length; j++) {
            const a = points[names[i]], b = points[names[j]], dx = (b[0] - a[0]) * px[0], dy = (b[1] - a[1]) * px[1], d = Math.hypot(dx, dy);
            if (d >= gap) continue;
            const ux = d > 0.01 ? dx / d : 0, uy = d > 0.01 ? dy / d : 1, push = (gap - d) / 2 + 0.2;
            a[0] -= ux * push / px[0]; a[1] -= uy * push / px[1]; b[0] += ux * push / px[0]; b[1] += uy * push / px[1]; moved = true;
          }
          if (!moved) break;
        }
        bodyMapCache.set(type, { image, points });
      }
      const { image, points } = bodyMapCache.get(type);
      mapCanvas.getContext('2d').putImageData(image, 0, 0);
      panel.querySelectorAll('.cps-map [data-part]').forEach(button => {
        const [x, y] = points[button.dataset.part]; button.style.left = x + '%'; button.style.top = y + '%';
      });
    }
    const figOf = id => (id === "b" ? figB : figA);

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
    const coarse = matchMedia("(pointer: coarse)");
    function handle(p, id, color, radius = 6, label = "") {
      const q = project(p); if (q.z < -1 || q.z > 1) return;
      if (coarse.matches) radius += 1.5;
      const active = id === "part:" + state.part;
      ctx.beginPath(); ctx.arc(q.x, q.y, radius + (active ? 3 : 0), 0, Math.PI * 2);
      ctx.fillStyle = active ? "#ffcc96" : color; ctx.fill(); ctx.lineWidth = active ? 2 : 1.5; ctx.strokeStyle = "#17202d"; ctx.stroke();
      if (active) { ctx.beginPath(); ctx.arc(q.x, q.y, radius + 6, 0, Math.PI * 2); ctx.strokeStyle = "rgba(255,204,150,.6)"; ctx.lineWidth = 1; ctx.stroke(); }
      if (label) { ctx.font = "11px system-ui"; ctx.fillStyle = color; ctx.fillText(label, q.x + 13, q.y + 4); }
      handles.push({ ...q, id, radius: Math.max(coarse.matches ? 22 : 12, radius + 5) });
    }
    const controlPoint = (id, cam = state.cam) => M.cameraControlPoint(cam, id, controlCenter);
    function insetRect() {
      return { width: previewWidth, height: previewHeight };
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
      updateBodyMap();
      // Light studio in day mode, dark studio at night; study lines always on paper.
      const light = drawing || !pageDark(), F = FINISH[finish];
      root.dataset.studio = light ? "light" : "dark";
      const background = drawing ? 0xebe9e3 : light ? 0xe7e4df : 0x141823;
      scene.background.setHex(background); scene.fog.color.setHex(background);
      grid.material.opacity = drawing ? 0.16 : light ? 0.22 : 0.65;
      floor.material.color.setHex(drawing ? 0xd9d6cd : light ? 0xdcd8d1 : 0x161a25);
      skin.color.setHex(drawing ? 0xf2f0e8 : F.a);
      skin2.color.setHex(drawing ? 0xe4e8ee : F.b);
      for (const m of [skin, skin2]) { const grain = F.grain && !drawing; if (m.vertexColors !== grain) { m.vertexColors = grain; m.needsUpdate = true; } m.roughness = drawing ? 0.65 : F.roughness; }
      outlines.forEach(m => { m.visible = drawing; });
      // The old construction lines were sized for the procedural head and torso; on the anatomical
      // mesh they float off the surface (a stray line above the head), so they stay hidden.
      construction.forEach(l => { l.visible = false; });
      const J = updateFigure(), r = insetRect(), spec = fitShot(J, r);
      const rigBox = figureBounds();
      // The key light: direction from the Light tab, soft or hard shadows.
      const lightCenter = J.chest, sunDir = M.lightDir(state.light);
      key.position.set(...add(lightCenter, mul(sunDir, 6))); key.target.position.set(...lightCenter); key.target.updateMatrixWorld();
      key.shadow.radius = state.light.soft ? 7 : 1.5; key.intensity = state.light.soft ? 3.2 : 3.8;
      const look = rigBox.getCenter(new THREE.Vector3());
      look.y = Math.max(0.7, look.y);
      // One physical camera pose drives the yellow icon, sight line and preview.
      controlCenter = spec.target;
      const cameraP = spec.pos;
      const far = state.tab === "camera" ? 1.3 / Math.min(1, width / height) : state.tab === "light" ? 1.35 : 1;
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
      // Copy the real camera image to a dock outside the interactive canvas. The
      // same renderer is reused; no preview can cover a joint or swallow a drag.
      if (preview.open) {
        helper.visible = false; grid.visible = false;
        for (const m of meshes) m.material = m.userData.original;
        fogFor(state.cam.distance); renderer.setScissorTest(false); renderer.setViewport(0, 0, previewWidth, previewHeight); renderer.render(scene, shot);
        const dpr = renderer.getPixelRatio();
        previewCtx.drawImage(canvas, 0, (height - previewHeight) * dpr, previewWidth * dpr, previewHeight * dpr, 0, 0, inset.width, inset.height);
      }
      helper.visible = state.tab === "camera";
      const center = controlCenter;
      if (helper.visible) {
        azRing.position.set(center[0], 0.012, center[2]);
        const points = Array.from({ length: 65 }, (_, i) => add(center, mul(M.camDir({ az: state.cam.az, el: -60 + i * 145 / 64 }), M.CAMERA.guideRadius)));
        elevationLine.geometry.setFromPoints(points.map(V)); elevationLine.geometry.computeBoundingSphere();
        sightLine.geometry.setFromPoints([V(center), V(cameraP)]); sightLine.geometry.computeBoundingSphere(); sightLine.computeLineDistances();
        cameraBody.position.copy(V(cameraP)); cameraBody.lookAt(V(center));
      }
      for (const m of meshes) m.material = state.tab === "pose" && m.userData.figure === state.editing && m.userData.part === state.part && (m.userData.original === skin || m.userData.original === skin2) ? selected : m.userData.original;
      grid.visible = true;
      fogFor(editorDistance); renderer.setScissorTest(false); renderer.setViewport(0, 0, width, height); renderer.render(scene, editorCamera);
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
      } else if (state.tab === "light") {
        const sun = add(lightCenter, mul(sunDir, 1.6)), a = project(lightCenter), b = project(sun);
        ctx.setLineDash([5, 5]); ctx.strokeStyle = "rgba(255,214,120,.8)"; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); ctx.setLineDash([]);
        ctx.fillStyle = "rgba(255,214,120,.25)"; ctx.beginPath(); ctx.arc(b.x, b.y, 18, 0, Math.PI * 2); ctx.fill();
        handle(sun, "sun", "#ffd678", 10);
      } else {
        // Stable letters match the model buttons, even after the figures cross sides.
        for (const fig of state.second ? [figA, figB] : [figA]) {
          const q = project(add(fig.J.head, [0, 0.18 * fig.J.headSize, 0]));
          if (q.z < -1 || q.z > 1) continue;
          ctx.fillStyle = fig.id === state.editing ? '#ffce99' : '#c7d3e6';
          ctx.beginPath(); ctx.roundRect(q.x - 13, q.y - 13, 26, 22, 8); ctx.fill();
          ctx.font = 'bold 12px system-ui'; ctx.fillStyle = '#17202d'; ctx.textAlign = 'center';
          ctx.fillText(fig.id.toUpperCase(), q.x, q.y + 2); ctx.textAlign = 'start';
        }
        const EJ = figOf(state.editing).J || J;
        // A turn ring at the feet of the figure being edited: drag its dot to rotate the whole figure.
        {
          const c = turnCenter(EJ), r = 0.5 * EJ.scale, pts = [];
          for (let i = 0; i <= 64; i++) { const t = i / 64 * Math.PI * 2, q = project([c[0] + Math.cos(t) * r, 0.012, c[2] + Math.sin(t) * r]); if (q.z > -1 && q.z < 1) pts.push(q); }
          ringPts = pts;
          ctx.beginPath(); pts.forEach((q, i) => i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y));
          const busy = dragging?.id === "turn" || dragging?.id === "move";
          ctx.strokeStyle = busy ? "rgba(255,188,120,.95)" : "rgba(255,188,120,.55)"; ctx.lineWidth = dragging?.id === "move" ? 3.5 : 2; ctx.stroke();
          const f = EJ.forward, tip = [c[0] + f[0] * r, 0.012, c[2] + f[2] * r], a = project([c[0] + f[0] * r * 0.72, 0.012, c[2] + f[2] * r * 0.72]), b = project(tip);
          ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.strokeStyle = "rgba(255,188,120,.9)"; ctx.lineWidth = 2; ctx.stroke();
          handle(tip, "turn", "#ffbc78", 7);
        }
        const joints = Object.entries(PARTS).map(([part, config]) => ({ part, point: EJ[config.joint] }));
        // Paint far handles first so the nearest overlapping joint remains selectable.
        joints.sort((a, b) => V(b.point).distanceTo(editorCamera.position) - V(a.point).distanceTo(editorCamera.position));
        if (!simple) for (const { part, point } of joints) handle(point, "part:" + part, part.startsWith("l") ? "#8edcce" : "#b4c6ef", part === state.part ? 5.5 : 4);
        // While dragging, show the numbers being changed next to what is moving.
        if (dragging) {
          const pose = cur(), text = ui[lang], pill = (pt, label) => {
            const q = project(pt); if (q.z < -1 || q.z > 1) return;
            ctx.font = "12px system-ui"; const w = ctx.measureText(label).width, x = clamp(q.x + 14, 10, width - w - 20), y = clamp(q.y - 30, 6, height - 28);
            ctx.fillStyle = "rgba(12,14,22,.82)"; ctx.beginPath(); ctx.roundRect(x - 7, y, w + 14, 21, 10); ctx.fill();
            ctx.fillStyle = "#ffe2bf"; ctx.fillText(label, x, y + 15);
          };
          if (dragging.id.startsWith("part:")) {
            const config = PARTS[state.part];
            pill(EJ[config.joint], config[lang] + "  " + config.controls.slice(0, 3).map(c => `${c[lang]} ${Math.round(M.get(pose, c.path))}°`).join(" · "));
          } else if (dragging.id === "turn") pill([turnCenter(EJ)[0], 0.012, turnCenter(EJ)[2]], `${text.turnLabel} ${Math.round(pose.yaw)}°`);
          else if (dragging.id === "move") pill([turnCenter(EJ)[0], 0.012, turnCenter(EJ)[2]], `X ${(pose.x || 0).toFixed(2)} m · Z ${(pose.z || 0).toFixed(2)} m`);
        }
      }
      helper.visible = false; grid.visible = false;
      for (const m of meshes) m.material = m.userData.original;
    }
    function render() { if (!scheduled) scheduled = requestAnimationFrame(renderNow); }
    // The fog fades the distant floor; it starts behind the figure for whichever camera is drawing,
    // so a far-away telephoto camera (or the editor framing it) never fogs the figure out.
    const fogFor = distance => { scene.fog.near = Math.max(6, distance + 2); scene.fog.far = Math.max(22, distance + 16); };
    const turnCenter = J => [J.pelvis[0], 0, J.pelvis[2]];
    const wrap180 = d => ((d + 180) % 360 + 360) % 360 - 180;
    /** Renders the actual camera view at full size and returns a PNG data URL. */
    function exportShot(longSide = 1600) {
      if (!renderer) return null;
      const a = aspectOf(), W = Math.round(a >= 1 ? longSide : longSide * a), H = Math.round(a >= 1 ? longSide / a : longSide);
      const J = updateFigure(), spec = M.shotCamera(state.cam, J), prevRatio = renderer.getPixelRatio();
      helper.visible = false; grid.visible = false;
      for (const m of meshes) m.material = m.userData.original;
      renderer.setPixelRatio(1); renderer.setSize(W, H, false); renderer.setScissorTest(false); renderer.setViewport(0, 0, W, H);
      shot.aspect = W / H; shot.fov = spec.fov; shot.position.copy(V(spec.pos)); shot.lookAt(V(spec.target)); shot.updateProjectionMatrix();
      fogFor(state.cam.distance); renderer.render(scene, shot);
      const url = canvas.toDataURL("image/png");
      renderer.setPixelRatio(prevRatio); renderer.setSize(width, height, false); render();
      return url;
    }
    function size() {
      const r = canvas.getBoundingClientRect(); width = r.width; height = r.height;
      cameraEditorFrame = null;
      const dpr = Math.min(devicePixelRatio || 1, 2);
      overlay.width = width * dpr; overlay.height = height * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      renderer?.setSize(width, height, false);
      const [rw, rh] = ratio.split(":").map(Number), aspect = rw > 0 && rh > 0 ? rw / rh : 1;
      previewWidth = Math.min(240, 160 * aspect, width); previewHeight = previewWidth / aspect;
      inset.style.width = previewWidth + 'px'; inset.style.height = previewHeight + 'px';
      inset.width = Math.round(previewWidth * dpr); inset.height = Math.round(previewHeight * dpr);
      render();
    }

    function aspectOf() { const [rw, rh] = ratio.split(':').map(Number); return rw / rh || 1; }
    function scene3(l) { return M.describeScene(value(), l, aspectOf()); }
    function cameraDescription(l) { return scene3(l).camera; }
    function output() {
      const l = opts.plang?.() || lang;
      const d = scene3(l);
      root.querySelector(".cps-out-text").textContent = state.tab === "camera" ? d.camera : state.tab === "light" ? d.light : d.pose;
    }
    function changed(kind, keepPreset = false) { if (kind === "pose" && !keepPreset) cur().preset = null; aimGaze(); if (kind === "cam" && !keepPreset) state.camPreset = null; state.cam = M.constrainCamera(state.cam, M.skeleton(state.pose)); sync(); output(); render(); emit(kind); }
    const angle = x => `${Math.round(x)}°`;
    function slider(path, label, min, max, val, hint = "", step = 1, unit = "°") {
      return `<label class="cps-sl"${hint ? ` title="${String(hint).replace(/<[^>]*>/g, "").replace(/"/g, "&quot;")}"` : ""}><span class="cps-sl-top"><span>${label}</span><output>${unit === "m" ? val.toFixed(2) + " m" : unit ? angle(val) : val.toFixed(2)}</output></span>
        <input aria-label="${label}" type="range" min="${min}" max="${max}" step="${step}" value="${val}" data-angle="${path}">${hint ? `<small>${hint}</small>` : ""}</label>`;
    }
    let lastPanelView = "";
    function renderPanel() {
      const view = state.tab + "/" + (state.poseTab || "presets");
      if (view !== lastPanelView) { lastPanelView = view; panel.classList.remove("cps-enter"); void panel.offsetWidth; panel.classList.add("cps-enter"); }
      const t = T[lang], text = ui[lang];
      root.querySelectorAll("[data-tab]").forEach(b => { b.textContent = t[b.dataset.tab] || text[b.dataset.tab]; b.setAttribute("aria-selected", b.dataset.tab === state.tab); b.tabIndex = b.dataset.tab === state.tab ? 0 : -1; });
      root.querySelector("[data-reset]").textContent = t.reset;
      root.querySelector(".cps-editor-label").textContent = text.editor;
      root.querySelectorAll("[data-view]").forEach(b => { b.textContent = text[b.dataset.view]; });
      root.querySelector(".cps-finishes").setAttribute("aria-label", text.finish);
      root.querySelector(".cps-rotate-text").textContent = text.rotateHint; root.querySelector("[data-fullscreen]").textContent = text.fullscreen;
      { const b = root.querySelector("[data-simple]"); if (b) b.textContent = text.simpleMode; }
      root.querySelectorAll("[data-finish]").forEach(b => { b.textContent = text["finish_" + b.dataset.finish]; b.setAttribute("aria-pressed", b.dataset.finish === finish); });
      root.querySelectorAll("[data-mode]").forEach(b => { b.textContent = text[b.dataset.mode]; b.setAttribute("aria-pressed", drawing === (b.dataset.mode === "drawing")); });
      root.querySelector(".cps-inset-label").textContent = text.actual;
      root.querySelector(".cps-help").textContent = state.tab === "camera" ? text.cameraHelp : state.tab === "light" ? text.lightHelp : text.fine + " " + text.ikHint;
      root.querySelector("[data-download]").textContent = "⬇ " + text.download;
      root.querySelector(".cps-out b").textContent = t.output;
      if (!renderer) status.textContent = text.unsupported;
      if (state.tab === "camera") {
        panel.innerHTML = `<div class="cps-chips"><span>${t.camPresets}</span>${CAM_PRESETS.map((c, i) => `<button type="button" data-campreset="${i}" aria-pressed="${state.camPreset === i}">${c[lang]}</button>`).join("")}</div><div class="cps-focus" role="group" aria-label="${text.focus}"><span>${text.focus}</span><div class="cps-seg">${['head', 'chest', 'whole'].map(f => `<button type="button" data-focus="${f}" aria-pressed="${state.cam.focus === f}">${text[f + 'Target']}</button>`).join('')}</div></div><div class="cps-focus cps-lens" role="group" aria-label="${text.lens}"><span>${text.lens}</span><div class="cps-seg">${[0, ...M.LENSES].map(l => `<button type="button" data-lens="${l}" aria-pressed="${(state.cam.lens || 0) === l}" title="${l ? l + " mm" : text.lensAuto}">${l || text.lensAuto}</button>`).join("")}</div></div><div class="cps-sliders">
          ${slider("cam.az", t.az, 0, 359, M.wrap360(state.cam.az - state.pose.yaw), t.azHint)}
          ${slider("cam.el", t.el, -60, 85, state.cam.el, t.elHint + ' · ' + text.floorHint + ': ' + Math.ceil(M.minCameraElevation(state.cam.distance, M.cameraTarget(state.cam, M.skeleton(state.pose)))) + '°', 0.1)}
          ${slider("cam.distance", t.dist, 0.2, 15, state.cam.distance, text.distanceHint, 0.01, "m")}</div>`;
      } else if (state.tab === "light") {
        const rel = M.wrap360(state.light.az - state.cam.az);
        panel.innerHTML = `<div class="cps-chips"><span>${text.lightPresets}</span>${M.LIGHT_PRESETS.map((p, i) => `<button type="button" data-lightpreset="${i}" aria-pressed="${lightPresetOn(i)}">${p[lang]}</button>`).join("")}</div>
          <div class="cps-focus" role="group"><span>${text.light}</span><div class="cps-seg"><button type="button" data-soft="1" aria-pressed="${state.light.soft}">${text.soft}</button><button type="button" data-soft="0" aria-pressed="${!state.light.soft}">${text.hard}</button></div></div>
          <div class="cps-sliders">${slider("light.az", text.lightAz, 0, 359, rel, text.lightAzHint)}${slider("light.el", text.lightEl, -20, 89, state.light.el, text.lightElHint)}</div>`;
      } else {
        const config = PARTS[state.part], pose = cur();
        const people = `<div class="cps-focus cps-people" role="group" aria-label="${text.people}"><span>${text.people}</span>
          <button type="button" data-edit="a" aria-label="${text.model} A" aria-pressed="${state.editing === "a" || !state.second}">${text.personA}</button>
          ${state.second ? `<button type="button" data-edit="b" aria-label="${text.model} B" aria-pressed="${state.editing === "b"}">${text.personB}</button><button type="button" data-second="0">${text.removePerson}</button>` : `<button type="button" data-second="1">${text.addPerson}</button>`}</div>`;
        const bodies = `<div class="cps-focus" role="group" aria-label="${text.body}"><span>${text.body}</span>${Object.entries(M.BODY_TYPES).map(([k, b]) => `<button type="button" data-body="${k}" aria-pressed="${pose.body === k}">${b[lang]}</button>`).join("")}</div>`;
        const where = state.second ? `<div class="cps-sliders">${slider("pair.distance", text.spacing, 0.2, 4, M.modelDistance(state.pose, state.pose2), text.spacingHint, 0.01, "m")}${slider("pose.x", text.posX, -3, 3, pose.x, "", 0.01, "m")}${slider("pose.z", text.posZ, -3, 3, pose.z, "", 0.01, "m")}</div>` : "";
        // Three short pages instead of one long panel: poses, body type, joints (with a body map).
        const page = state.poseTab || "presets";
        const subtabs = `<div class="cps-subtabs" role="tablist">${[["presets", text.pagePoses], ["figure", text.pageFigure], ["joints", text.pageJoints]].map(([k, label]) => `<button type="button" role="tab" data-subtab="${k}" aria-selected="${page === k}">${label}</button>`).join("")}</div>`;
        let body = "";
        const rel = M.wrap360(state.cam.az - pose.yaw);
        // Facing buttons share the turn slider's box (one compact row), to keep the page short.
        const facing = `<div class="cps-sliders cps-turn"><div class="cps-seg" role="group" aria-label="${text.facing}">${[[0, "faceFront"], [90, "faceRight"], [180, "faceBack"], [270, "faceLeft"]].map(([r, k]) => `<button type="button" data-facing="${r}" aria-pressed="${Math.min(Math.abs(rel - r), 360 - Math.abs(rel - r)) < 0.5}">${text[k]}</button>`).join("")}</div>${slider("pose.yaw", text.turnLabel, -180, 180, pose.yaw, text.turnHint)}</div>`;
        if (page === "presets") body = `${facing}<div class="cps-chips cps-presets">${PRESETS.map(p => `<button type="button" data-preset="${p.id}" aria-pressed="${pose.preset === p.id}">${p[lang]}</button>`).join("")}<label class="cps-check cps-stool"><input type="checkbox" data-seated ${pose.seated ? "checked" : ""}> ${text.stool}</label></div>`;
        // Placement sliders live with the body type (dragging the ring at the feet moves a figure too).
        else if (page === "figure") body = `${bodies}${where}`;
        else body = `<div class="cps-joints"><div class="cps-map" role="group" aria-label="${text.selected}"><canvas width="192" height="384" aria-hidden="true"></canvas>${Object.entries(BODY_MAP).map(([k, [x, y]]) => `<button type="button" data-part="${k}" aria-pressed="${k === state.part}" title="${PARTS[k][lang]}" aria-label="${PARTS[k][lang]}" style="left:${x / 1.2}%;top:${y / 2.4}%"></button>`).join("")}
            <span class="cps-map-side" style="left:4%">${text.mapRight}</span><span class="cps-map-side" style="right:4%">${text.mapLeft}</span></div>
          <div class="cps-joint-edit"><div class="cps-joint-heading"><strong>${config[lang]}</strong><button type="button" data-reset-part>${text.resetPart}</button></div>
            <div class="cps-sliders">${config.controls.map(c => slider("pose." + c.path, c[lang], c.min, c.max, M.get(pose, c.path))).join("")}</div>
            <div class="cps-joint-tools"><button type="button" data-flip>${text.flip}</button><button type="button" data-mirror="${state.part.startsWith("l") ? "l" : "r"}" ${/^[lr]/.test(state.part) ? "" : "disabled"}>${text.mirror}</button></div></div></div>`;
        // Gaze sits with the model switch, above the pages, so it is visible (and still following) on every page.
        const gazeRow = `<div class="cps-focus cps-gaze" role="group" aria-label="${text.gaze}"><span>${text.gaze}</span><div class="cps-seg">${gazeButtons()}</div></div>`;
        panel.innerHTML = `${people}${gazeRow}${subtabs}${body}`;
      }
      // Lay every labelled option row out as label column + options, so rows align on every page.
      panel.querySelectorAll(".cps-focus, .cps-chips").forEach(row => {
        const label = row.querySelector(":scope > span"); if (!label || row.querySelector(":scope > .cps-opts")) return;
        const opts = document.createElement("div"); opts.className = "cps-opts";
        [...row.childNodes].filter(n => n !== label).forEach(n => opts.append(n)); row.append(opts); row.classList.add("cps-row");
      });
      makeRails();
      // A rebuilt panel has a blank map canvas: paint the figure now instead of waiting for the next frame.
      if (panel.querySelector('.cps-map canvas')) updateBodyMap();
      output();
    }
    // Every choice row is one segmented rail (like the lens row). If it does not fit, ‹ › arrows
    // and soft edges appear and the row slides sideways; the selected option is kept in view.
    function makeRails() {
      const rows = [...panel.querySelectorAll(".cps-row > .cps-opts")];
      for (const holder of rows) {
        // Model actions stay as buttons; angles, light presets and poses stay as grids (all visible at once).
        if (holder.querySelector("[data-second], [data-edit], [data-campreset], [data-lightpreset], [data-preset]")) continue;
        let track = holder.querySelector(":scope > .cps-seg");
        const buttons = track ? null : [...holder.children].filter(n => n.tagName === "BUTTON");
        if (!track) { if (!buttons.length) continue; track = document.createElement("div"); track.className = "cps-seg"; buttons.forEach(b => track.append(b)); }
        const rail = document.createElement("div"); rail.className = "cps-rail";
        const prev = document.createElement("button"), next = document.createElement("button");
        prev.type = next.type = "button"; prev.className = "cps-rail-btn"; next.className = "cps-rail-btn";
        prev.textContent = "‹"; next.textContent = "›"; prev.tabIndex = next.tabIndex = -1;
        prev.setAttribute("aria-label", ui[lang].railPrev); next.setAttribute("aria-label", ui[lang].railNext);
        track.classList.add("cps-rail-track");
        const extra = [...holder.childNodes];                                          // e.g. the stool checkbox
        holder.replaceChildren(rail); rail.append(prev, track, next); extra.forEach(n => { if (n !== track) holder.append(n); });
        holder.classList.add("cps-rail-holder");
        const update = () => {
          const over = track.scrollWidth - track.clientWidth > 2, start = track.scrollLeft > 2, end = track.scrollLeft < track.scrollWidth - track.clientWidth - 2;
          rail.classList.toggle("over", over); prev.disabled = !start; next.disabled = !end;
          rail.classList.toggle("fade-start", over && start); rail.classList.toggle("fade-end", over && end);
        };
        const step = dir => track.scrollBy({ left: dir * Math.max(80, track.clientWidth * 0.7), behavior: "smooth" });
        prev.addEventListener("click", e => { e.stopPropagation(); step(-1); });
        next.addEventListener("click", e => { e.stopPropagation(); step(1); });
        track.addEventListener("scroll", update, { passive: true });
        requestAnimationFrame(() => {
          const on = track.querySelector('[aria-pressed="true"]');
          if (on) track.scrollLeft = Math.max(0, on.offsetLeft - (track.clientWidth - on.offsetWidth) / 2);
          update();
        });
      }
    }
    function sync() {
      panel.querySelectorAll("[data-angle]").forEach(input => {
        const path = input.dataset.angle;
        const val = path === "pair.distance" ? M.modelDistance(state.pose, state.pose2) : path === "cam.az" ? M.wrap360(state.cam.az - state.pose.yaw) : path === "light.az" ? M.wrap360(state.light.az - state.cam.az) : path.startsWith("light.") ? state.light[path.slice(6)] : path.startsWith("cam.") ? state.cam[path.slice(4)] : M.get(cur(), path.slice(5));
        if (path === 'cam.el') input.closest('label').querySelector('small').textContent = T[lang].elHint + ' · ' + ui[lang].floorHint + ': ' + Math.ceil(M.minCameraElevation(state.cam.distance, M.cameraTarget(state.cam, M.skeleton(state.pose)))) + '°';
        input.value = val; input.closest("label").querySelector("output").textContent = path === "pair.distance" || path === "cam.distance" || path === "pose.x" || path === "pose.z" ? val.toFixed(2) + ' m' : angle(val);
      });
      panel.querySelectorAll('[data-focus]').forEach(b => b.setAttribute('aria-pressed', b.dataset.focus === state.cam.focus));
      panel.querySelectorAll("[data-preset]").forEach(b => b.setAttribute("aria-pressed", cur().preset === b.dataset.preset));
      { const g = panel.querySelector(".cps-gaze .cps-seg"); if (g) g.innerHTML = gazeButtons(); }
      panel.querySelectorAll("[data-lens]").forEach(b => b.setAttribute("aria-pressed", (state.cam.lens || 0) === +b.dataset.lens));
      panel.querySelectorAll("[data-facing]").forEach(b => { const rel = M.wrap360(state.cam.az - cur().yaw), r = +b.dataset.facing; b.setAttribute("aria-pressed", Math.min(Math.abs(rel - r), 360 - Math.abs(rel - r)) < 0.5); });
      panel.querySelectorAll("[data-campreset]").forEach(b => b.setAttribute("aria-pressed", state.camPreset === +b.dataset.campreset));
      panel.querySelectorAll("[data-lightpreset]").forEach(b => b.setAttribute("aria-pressed", lightPresetOn(+b.dataset.lightpreset)));
      panel.querySelectorAll('[data-seated]').forEach(input => { input.checked = cur().seated; });
    }
    // A light preset counts as selected while the light still sits exactly where it put it.
    function lightPresetOn(i) {
      const p = M.LIGHT_PRESETS[i], rel = M.wrap360(state.light.az - state.cam.az), d = Math.abs(rel - M.wrap360(p.rel));
      return Math.min(d, 360 - d) < 0.5 && Math.abs(state.light.el - p.el) < 0.5;
    }
    function selectPart(part) { state.part = part; state.poseTab = "joints"; renderPanel(); render(); }
    root.addEventListener("click", e => {
      const button = e.target.closest("button"); if (!button) return;
      if (button.dataset.tab) { state.tab = button.dataset.tab; if (state.tab !== "pose") gazePick = false; cameraEditorFrame = null; renderPanel(); render(); }
      else if (button.dataset.subtab) { state.poseTab = button.dataset.subtab; renderPanel(); render(); }
      else if (button.hasAttribute("data-reset")) {
        if (state.tab === "camera") state.cam = M.normalizeCamera({ az: M.wrap360(state.pose.yaw + 45), el: 10, distance: 2.8, focus: "chest" });
        else if (state.tab === "light") state.light = M.normalizeLight();
        else if (state.editing === "b" && state.second) state.pose2 = defaultPose2();
        else state.pose = M.normalizePose({ preset: "stand" });
        renderPanel(); render(); emit(state.tab === "camera" ? "cam" : state.tab === "light" ? "light" : "pose");
      } else if (button.dataset.view) {
        const name = button.dataset.view;
        view = { yaw: state.pose.yaw + ({ front: 0, side: 90, back: 180, frame: 25 }[name]), pitch: name === "frame" ? 12 : 0, dist: 3.8 }; cameraEditorFrame = null; render();
      } else if (button.dataset.finish) {
        finish = button.dataset.finish; try { localStorage.setItem("promptlab.finish", finish); } catch (e) {}
        root.querySelectorAll("[data-finish]").forEach(b => b.setAttribute("aria-pressed", b === button)); render();
      } else if (button.dataset.mode) {
        drawing = button.dataset.mode === "drawing";
        root.dataset.render = drawing ? "drawing" : "volume";
        root.querySelectorAll("[data-mode]").forEach(b => b.setAttribute("aria-pressed", b === button)); render();
      } else if (button.dataset.focus) {
        state.cam.focus = button.dataset.focus;
        if (state.cam.focus === 'whole') {
          const J = updateFigure(), box = figureBounds(), rect = insetRect();
          state.cam.distance = M.fitCameraDistance(state.cam, J, rect.width / rect.height, { min: box.min.toArray(), max: box.max.toArray() });
        }
        cameraEditorFrame = null; changed('cam'); renderPanel();
      } else if (button.dataset.campreset !== undefined) {
        // Keep the chosen lens: the preset's distance is for the default view, so scale it to frame the same.
        const p = CAM_PRESETS[+button.dataset.campreset], lens = state.cam.lens || 0;
        const scale = lens ? Math.tan(M.camFov({}) * D2R / 2) / Math.tan(M.camFov({ lens }) * D2R / 2) * 1.03 : 1;
        state.cam = M.normalizeCamera({ ...p.c, lens, distance: clamp(p.c.distance * scale, 0.2, 15), az: M.wrap360(p.c.az + state.pose.yaw) });
        if (p.fit) { const J = updateFigure(), box = figureBounds(), rect = insetRect(); state.cam.distance = M.fitCameraDistance(state.cam, J, rect.width / rect.height, { min: box.min.toArray(), max: box.max.toArray() }); }
        cameraEditorFrame = null; changed("cam", true); state.camPreset = +button.dataset.campreset; renderPanel();
      } else if (button.dataset.preset) {
        // Keep who it is, where they stand and what they hold; take the preset's joints.
        const old = cur(), next = M.normalizePose({ ...copy(PRESETS.find(p => p.id === button.dataset.preset).pose), preset: button.dataset.preset, body: old.body, props: [], x: old.x, z: old.z });
        const editingB = state.editing === "b" && state.second; gaze[editingB ? "b" : "a"] = null;
        if (editingB) next.yaw = next.yaw || old.yaw;
        // Glide from the old pose to the new one (the end pose is resolved first so it does not snap).
        const end = copy(next); M.resolveArms(end);
        const from = copy(old), put = p => { if (editingB) state.pose2 = p; else state.pose = p; };
        const lerp = (a, b, t) => typeof b === "number" && typeof a === "number" ? a + (b - a) * t : b && typeof b === "object" && !Array.isArray(b) ? Object.fromEntries(Object.keys(b).map(k => [k, lerp(a ? a[k] : undefined, b[k], t)])) : b;
        const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches, started = performance.now(), duration = reduce || from.seated !== next.seated || from.body !== next.body ? 0 : 280;
        cancelAnimationFrame(presetGlide);
        const step = now => {
          const t = duration ? Math.min(1, (now - started) / duration) : 1, e = t * (2 - t);
          if (t < 1) { const frame = lerp(from, end, e); frame.preset = null; frame.props = next.props; put(frame); render(); presetGlide = requestAnimationFrame(step); }
          else { put(next); renderPanel(); render(); emit("pose"); }
        };
        presetGlide = requestAnimationFrame(step);
      } else if (button.dataset.part) selectPart(button.dataset.part);
      else if (button.hasAttribute("data-reset-part")) {
        const base = M.BASE(); for (const c of PARTS[state.part].controls) M.put(cur(), c.path, M.get(base, c.path)); changed("pose");
      } else if (button.hasAttribute("data-flip")) {
        const pose = cur();
        for (const kind of ["Arm", "Leg"]) [pose["l" + kind], pose["r" + kind]] = [pose["r" + kind], pose["l" + kind]];
        for (const k of ["side", "twist", "pelvisRoll", "headYaw", "headTilt", "neckYaw", "neckTilt"]) pose[k] *= -1;
        changed("pose");
      } else if (button.dataset.mirror) {
        const s = button.dataset.mirror, other = s === "l" ? "r" : "l";
        for (const c of PARTS[state.part].controls) M.put(cur(), other + c.path.slice(1), M.get(cur(), c.path)); changed("pose");
      } else if (button.hasAttribute("data-download")) {
        const url = exportShot(); if (!url) return;
        const a = document.createElement("a"); a.href = url; a.download = "camera-view.png"; a.click();
        const label = button.textContent; button.textContent = "✓ " + ui[lang].downloaded; setTimeout(() => { button.textContent = label; }, 1500);
      } else if (button.dataset.lightpreset !== undefined) {
        const p = M.LIGHT_PRESETS[+button.dataset.lightpreset];
        state.light = M.normalizeLight({ ...state.light, az: state.cam.az + p.rel, el: p.el }); renderPanel(); render(); emit("light");
      } else if (button.dataset.soft !== undefined) {
        state.light.soft = button.dataset.soft === "1"; renderPanel(); render(); emit("light");
      } else if (button.dataset.edit) {
        state.editing = button.dataset.edit; renderPanel(); render();
      } else if (button.dataset.second !== undefined) {
        state.second = button.dataset.second === "1"; state.editing = state.second ? "b" : "a";
        cameraEditorFrame = null; renderPanel(); render(); emit("pose");
      } else if (button.dataset.gaze) {
        const g = button.dataset.gaze, id = state.editing === "b" && state.second ? "b" : "a";
        if (g === "pick") { gazePick = !gazePick; renderPanel(); return; }
        gazePick = false; gazeCache[id] = "";
        if (g === "ahead") { gaze[id] = "ahead"; Object.assign(cur(), { neckYaw: 0, neckPitch: 0, neckTilt: 0, headYaw: 0, headPitch: 0, headTilt: 0 }); }
        else gaze[id] = g;
        changed("pose", true); renderPanel();
      } else if (button.dataset.lens !== undefined) {
        // Keep the subject about the same size: a longer lens steps back, a wider one steps in.
        const lens = +button.dataset.lens, before = M.camFov(state.cam), after = M.camFov({ lens });
        const distance = clamp(state.cam.distance * Math.tan(before * D2R / 2) / Math.tan(after * D2R / 2) * (after < before ? 1.03 : 1), 0.2, 15);
        state.cam = M.normalizeCamera({ ...state.cam, lens, distance }); cameraEditorFrame = null; changed("cam"); renderPanel();
      } else if (button.dataset.facing !== undefined) {
        // Turn the figure so the camera sees this side (front, right, back, left).
        cur().yaw = wrap180(state.cam.az - +button.dataset.facing); changed("pose", true); renderPanel();
      } else if (button.dataset.body) {
        cur().body = button.dataset.body; cameraEditorFrame = null; renderPanel(); render(); emit("pose");
      }
    });
    root.addEventListener("input", e => {
      const path = e.target.dataset.angle;
      if (path) {
        if (path === "pair.distance") {
          [state.pose, state.pose2] = M.spaceModels(state.pose, state.pose2, +e.target.value);
          cameraEditorFrame = null; changed("pose", true); return;
        }
        if (path.startsWith("cam.")) state.cam[path.slice(4)] = path === "cam.az" ? M.wrap360(+e.target.value + state.pose.yaw) : +e.target.value;
        else if (path.startsWith("light.")) state.light[path.slice(6)] = path === "light.az" ? M.wrap360(+e.target.value + state.cam.az) : +e.target.value;
        else { M.put(cur(), path.slice(5), +e.target.value); if (/^pose\.(neck|head)/.test(path)) gaze[state.editing === "b" && state.second ? "b" : "a"] = null; }
        changed(path.startsWith("cam.") ? "cam" : path.startsWith("light.") ? "light" : "pose", path === "pose.x" || path === "pose.z");
      } else if (e.target.hasAttribute("data-seated")) { Object.assign(cur(), M.setSeated(cur(), e.target.checked)); changed("pose"); }
    });
    root.querySelector(".cps-tabs").addEventListener("keydown", e => {
      if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) return;
      const tabs = ["camera", "pose", "light"], i = tabs.indexOf(state.tab);
      e.preventDefault(); state.tab = e.key === "Home" ? "camera" : e.key === "End" ? "light" : tabs[(i + (e.key === "ArrowLeft" ? 2 : 1)) % 3]; if (state.tab !== "pose") gazePick = false; cameraEditorFrame = null;
      renderPanel(); root.querySelector(`[data-tab="${state.tab}"]`).focus(); render();
    });
    const point = e => { const r = canvas.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
    function pick(p) {
      const h = [...handles].reverse().find(h => Math.hypot(h.x - p.x, h.y - p.y) <= h.radius); if (h) return h.id;
      if (state.tab !== "pose") return null;
      // Grabbing the ring itself (not its dot) moves the figure across the floor.
      for (let i = 1; i < ringPts.length; i++) {
        const a = ringPts[i - 1], b = ringPts[i], vx = b.x - a.x, vy = b.y - a.y, t = clamp(((p.x - a.x) * vx + (p.y - a.y) * vy) / (vx * vx + vy * vy || 1), 0, 1);
        if (Math.hypot(a.x + vx * t - p.x, a.y + vy * t - p.y) < (coarse.matches ? 16 : 7)) return "move";
      }
      if (simple) return null;
      raycaster.setFromCamera({ x: p.x / width * 2 - 1, y: 1 - p.y / height * 2 }, editorCamera);
      const hit = raycaster.intersectObjects(meshes.filter(m => m.visible && (m.userData.figure === "a" || state.second)), false)[0];
      if (!hit) return null;
      const fig = hit.object.userData.figure || "a";
      if (hit.object.userData.part === "surface") {
        const J = figOf(fig).J || M.skeleton(fig === "b" ? state.pose2 : state.pose);
        const closest = Object.entries(PARTS).sort((a, b) => V(J[a[1].joint]).distanceToSquared(hit.point) - V(J[b[1].joint]).distanceToSquared(hit.point))[0];
        return 'part:' + closest[0] + '@' + fig;
      }
      return 'part:' + hit.object.userData.part + '@' + fig;
    }
    // Hand, finger-tip and ankle handles move the whole limb (inverse kinematics).
    const REACH = { Hand: ["Arm", "Wrist"], Fingers: ["Arm", "Hand"], Foot: ["Leg", "Ankle"] };
    // Look at what is under the pointer: the other figure's body, else the floor, else a point in the air
    // in front of the face.
    function gazeAt(p, quick) {
      raycaster.setFromCamera({ x: p.x / width * 2 - 1, y: 1 - p.y / height * 2 }, editorCamera);
      const id = state.editing === "b" && state.second ? "b" : "a", J = figOf(id).J || M.skeleton(cur());
      const hit = raycaster.intersectObjects(meshes.filter(m => m.visible && (m.userData.figure || "a") !== id), false)[0];
      const facing = new THREE.Vector3(); editorCamera.getWorldDirection(facing);
      const wall = new THREE.Plane().setFromNormalAndCoplanarPoint(facing, V(add(J.head, mul(J.forward, 1.2))));
      const floorHit = rayPoint(p, new THREE.Plane(new THREE.Vector3(0, 1, 0), 0));
      const target = hit ? hit.point.toArray() : floorHit && Math.hypot(floorHit[0] - J.head[0], floorHit[2] - J.head[2]) < 12 ? floorHit : rayPoint(p, wall);
      if (!target) return;
      const pose = cur(); gaze[id] = { point: target }; M.lookAt(pose, target, { quick }); pose.preset = null;
      gazeCache[id] = gazeKey(pose, target); changed("pose", true);
    }
    function rayPoint(p, plane) {
      raycaster.setFromCamera({ x: p.x / width * 2 - 1, y: 1 - p.y / height * 2 }, editorCamera);
      const hit = new THREE.Vector3(); return raycaster.ray.intersectPlane(plane, hit) ? hit.toArray() : null;
    }
    canvas.addEventListener("pointerdown", e => {
      if (!renderer || lost || e.button !== 0 || dragging) return;
      if (gazePick && state.tab === "pose") {
        // Press and drag: the head follows the pointer until release; the mode stays on for more.
        const p = point(e); dragging = { id: "gaze", pointer: e.pointerId, last: p };
        try { canvas.setPointerCapture(e.pointerId); } catch (err) {} gazeAt(p, false); e.preventDefault(); return;
      }
      const p = point(e); let id = pick(p);
      if (id?.startsWith("part:")) {
        const [part, fig] = id.slice(5).split("@");
        if (fig && fig !== state.editing) state.editing = fig;
        id = "part:" + part; selectPart(part);
      }
      const h = handles.find(h => h.id === id);
      dragging = { id: id || "orbit", last: p, pointer: e.pointerId, offset: h ? { x: h.x - p.x, y: h.y - p.y } : { x: 0, y: 0 } };
      if (id === "move") { const floorHit = rayPoint(p, new THREE.Plane(new THREE.Vector3(0, 1, 0), 0)); dragging.move = floorHit ? { hit: floorHit, x: cur().x || 0, z: cur().z || 0 } : null; }
      const reach = id?.startsWith("part:") && REACH[state.part.slice(1)];
      if (reach && /^[lr]/.test(state.part)) {
        const J = figOf(state.editing).J || M.skeleton(cur()), joint = state.part[0] + reach[1];
        const normal = new THREE.Vector3(); editorCamera.getWorldDirection(normal);
        dragging.ik = { side: state.part[0], kind: reach[0], joint, plane: new THREE.Plane().setFromNormalAndCoplanarPoint(normal, V(J[joint])) };
      }
      try { canvas.setPointerCapture(e.pointerId); } catch (err) {} canvas.style.cursor = "grabbing"; e.preventDefault();
    });
    function nudge(part, dx, dy) {
      const controls = PARTS[part].controls;
      if (part.endsWith('Fingers')) {
        const arm = cur()[part[0] + 'Arm'];
        for (const name of ['thumb', 'index', 'middle', 'ring', 'pinky']) arm[name] = clamp(arm[name] - dy * 0.7, 0, name === 'thumb' ? 90 : 100);
        arm.spread = clamp(arm.spread + dx * 0.2, 0, 22); return;
      }
      // Match a drag to the screen-space motion of this joint's descendant. This stays
      // consistent from the front, side and back, including after the body turns.
      const suffix = { Arm: "Elbow", Elbow: "Wrist", Hand: "Hand", Fingers: "Hand", Leg: "Knee", Knee: "Ankle", Foot: "Toe" };
      const endpoint = part === "body" ? "chest" : ["chest", "neck", "head"].includes(part) ? "head" : part[0] + suffix[part.slice(1)];
      const probe = J => part === 'body' ? add(J.chest, mv(J.ubM, [0, 0, 0.15])) : ['chest', 'neck', 'head'].includes(part) ? add(J.head, mv(J.headM, [0, 0, 0.14])) : J[endpoint] || J[PARTS[part].joint];
      const source = M.skeleton(cur()), tip = probe(source);
      let best = controls[0], bestScore = -1, sign = 1;
      for (const c of controls.slice(0, 3)) {
        const test = copy(cur()); M.put(test, c.path, M.get(test, c.path) + 2);
        const next = M.skeleton(test), a = project(tip), b = project(probe(next));
        const x = b.x - a.x, y = b.y - a.y, len = Math.hypot(x, y);
        const score = len > 0.01 ? Math.abs((x * dx + y * dy) / len) : -1;
        if (score > bestScore) { best = c; bestScore = score; sign = Math.sign(x * dx + y * dy) || 1; }
      }
      const delta = bestScore < 0.05 ? (Math.abs(dx) > Math.abs(dy) ? dx : -dy) * 0.6 : Math.hypot(dx, dy) * sign * 0.65;
      M.put(cur(), best.path, clamp(M.get(cur(), best.path) + delta, best.min, best.max));
    }
    canvas.addEventListener("pointermove", e => {
      const p = point(e);
      if (!dragging) { const picking = gazePick && state.tab === "pose", id = picking ? null : pick(p); canvas.style.cursor = picking ? "crosshair" : id === "move" ? "move" : id ? "grab" : "default"; return; }
      if (e.pointerId !== dragging.pointer) return;
      const dx = p.x - dragging.last.x, dy = p.y - dragging.last.y; dragging.last = p;
      if (dragging.id === "gaze") { gazeAt(p, true); return; }
      if (dragging.id === "orbit") { view.yaw -= dx * 0.4; view.pitch = clamp(view.pitch + dy * 0.3, -25, 80); render(); return; }
      if (dragging.ik) {
        const target = rayPoint(p, dragging.ik.plane);
        if (target) {
          const { side, kind, joint } = dragging.ik, key = side + kind, solved = M.reach(cur(), side, kind, joint, target, { quick: true, iterations: 16 });
          Object.assign(cur()[key], { a: solved[key].a, b: solved[key].b, c: solved[key].c });
          changed("pose");
        }
        return;
      }
      if (dragging.id === "move") {
        const hit = dragging.move && rayPoint(p, new THREE.Plane(new THREE.Vector3(0, 1, 0), 0));
        if (hit) { const pose = cur(); pose.x = clamp(dragging.move.x + hit[0] - dragging.move.hit[0], -3, 3); pose.z = clamp(dragging.move.z + hit[2] - dragging.move.hit[2], -3, 3); changed("pose", true); }
        else render();
        return;
      }
      if (dragging.id === "turn") {
        // Point the figure toward where the pointer meets the floor (5° steps, or free with Shift).
        const J = figOf(state.editing).J || M.skeleton(cur()), c = turnCenter(J), hit = rayPoint(p, new THREE.Plane(new THREE.Vector3(0, 1, 0), 0));
        if (hit && Math.hypot(hit[0] - c[0], hit[2] - c[2]) > 0.05) {
          let yaw = Math.atan2(-(hit[0] - c[0]), hit[2] - c[2]) / D2R; if (!e.shiftKey) yaw = Math.round(yaw / 5) * 5;
          cur().yaw = wrap180(yaw); changed("pose");
        }
        return;
      }
      if (dragging.id.startsWith("part:")) { if (["neck", "head"].includes(state.part)) gaze[state.editing === "b" && state.second ? "b" : "a"] = null; nudge(state.part, dx, dy); changed("pose"); return; }
      if (dragging.id === "sun") {
        // Move the sun to the nearby az / el whose screen position is closest to the pointer.
        const J = figA.J, base = { ...state.light };
        let best = base, score = Infinity;
        for (let da = -24; da <= 24; da += 2) for (let de = -16; de <= 16; de += 2) {
          const c = { az: base.az + da, el: clamp(base.el + de, -20, 89) }, q = project(add(J.chest, mul(M.lightDir(c), 1.6)));
          const d = (q.x - p.x) ** 2 + (q.y - p.y) ** 2 + (da * da + de * de) * 0.02;
          if (d < score) { score = d; best = c; }
        }
        state.light = M.normalizeLight({ ...state.light, az: best.az, el: best.el }); changed("light"); return;
      }
      const id = dragging.id;
      // Stay on the nearby branch of the projected track. A floor ring can project
      // to almost the same pixel at two very different azimuths; a global search
      // would jump between them. Preserve the initial grab offset as well.
      const target = { x: p.x + dragging.offset.x, y: p.y + dragging.offset.y };
      state.cam[id] = M.dragCameraControl(state.cam, id, target, project, controlCenter); changed("cam");
    });
    const end = e => { if (dragging && e.pointerId === dragging.pointer) { const wasGaze = dragging.id === "gaze"; dragging = null; canvas.style.cursor = gazePick ? "crosshair" : "default"; if (wasGaze) renderPanel(); render(); } };
    canvas.addEventListener("pointerup", end); canvas.addEventListener("pointercancel", end); canvas.addEventListener("lostpointercapture", end);
    // Two fingers: pinch to zoom the studio view (the first finger's drag is cancelled).
    const touches = new Map(); let pinch = 0;
    canvas.addEventListener("pointerdown", e => { if (e.pointerType !== "touch") return; touches.set(e.pointerId, [e.clientX, e.clientY]); if (touches.size === 2) { dragging = null; const [a, b] = [...touches.values()]; pinch = Math.hypot(a[0] - b[0], a[1] - b[1]); } }, true);
    canvas.addEventListener("pointermove", e => {
      if (!touches.has(e.pointerId)) return; touches.set(e.pointerId, [e.clientX, e.clientY]);
      if (touches.size === 2 && pinch) { const [a, b] = [...touches.values()], d = Math.hypot(a[0] - b[0], a[1] - b[1]); if (d > 0) { view.dist = clamp(view.dist * pinch / d, 1.7, 9); pinch = d; render(); } e.stopImmediatePropagation(); }
    }, true);
    const lift = e => { touches.delete(e.pointerId); if (touches.size < 2) pinch = 0; };
    canvas.addEventListener("pointerup", lift, true); canvas.addEventListener("pointercancel", lift, true);
    canvas.addEventListener("wheel", e => { e.preventDefault(); view.dist = clamp(view.dist * (1 + Math.sign(e.deltaY) * 0.08), 1.7, 9); render(); }, { passive: false });
    canvas.addEventListener("webglcontextlost", e => { e.preventDefault(); lost = true; status.hidden = false; status.textContent = ui[lang].context; });
    canvas.addEventListener("webglcontextrestored", () => { lost = false; status.hidden = true; render(); });
    preview.addEventListener('toggle', render);
    state.cam = M.constrainCamera(state.cam, M.skeleton(state.pose));
    // Phones held upright: suggest landscape (and offer full screen, which can lock to landscape).
    const rotateBar = root.querySelector(".cps-rotate"), portraitTouch = matchMedia("(orientation: portrait) and (pointer: coarse) and (max-width: 900px)");
    let rotateDismissed = false; try { rotateDismissed = sessionStorage.getItem("promptlab.rotateHint") === "0"; } catch (e) {}
    const syncRotate = () => { rotateBar.hidden = rotateDismissed || !portraitTouch.matches; };
    portraitTouch.addEventListener?.("change", syncRotate); syncRotate();
    rotateBar.querySelector("[data-rotate-close]").addEventListener("click", () => { rotateDismissed = true; try { sessionStorage.setItem("promptlab.rotateHint", "0"); } catch (e) {} syncRotate(); });
    rotateBar.querySelector("[data-fullscreen]").addEventListener("click", async () => {
      try { if (!document.fullscreenElement) await root.requestFullscreen(); await screen.orientation?.lock?.("landscape"); } catch (e) {}
      setTimeout(size, 300);
    });
    document.addEventListener("fullscreenchange", () => setTimeout(size, 200));
    const syncSimple = () => { root.classList.toggle("cps-simple", simple); const b = root.querySelector("[data-simple]"); b.setAttribute("aria-pressed", simple); b.textContent = ui[lang].simpleMode; };
    root.querySelector("[data-simple]").addEventListener("click", () => {
      simple = !simple; try { localStorage.setItem("promptlab.simple", simple ? "1" : "0"); } catch (e) {}
      if (simple && state.poseTab === "joints") state.poseTab = "presets";
      syncSimple(); renderPanel(); render();
    });
    syncSimple();
    // Follow the page's day / night theme.
    const themeWatch = new MutationObserver(() => render()); themeWatch.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    const darkMedia = matchMedia("(prefers-color-scheme: dark)"), onScheme = () => render(); darkMedia.addEventListener?.("change", onScheme);
    // The stage's how-to line shows for a few seconds at first, then only while pointing at the stage.
    const stageEl = root.querySelector(".cps-stage"), unfresh = () => stageEl.classList.remove("fresh");
    setTimeout(unfresh, 7000); stageEl.addEventListener("pointerdown", unfresh, { once: true });
    const ro = new ResizeObserver(size); ro.observe(canvas); size(); renderPanel();
    return {
      value, set(val = {}) {
        gaze.a = gaze.b = null; gazeCache.a = gazeCache.b = ""; state.cam = M.normalizeCamera(val.cam); state.pose = loadPose(val.pose);
        state.pose2 = val.pose2 ? loadPose(val.pose2) : defaultPose2(); state.second = val.second === true; state.light = M.normalizeLight(val.light);
        if (!state.second) state.editing = "a";
        state.cam = M.constrainCamera(state.cam, M.skeleton(state.pose)); cameraEditorFrame = null; renderPanel(); render();
      },
      snapshot: exportShot,
      setLang(l) { lang = l; renderPanel(); render(); }, setRatio(r) { ratio = r; size(); }, refresh() { size(); output(); },
      describe(l) { return scene3(l); },
      destroy() { ro.disconnect(); themeWatch.disconnect(); darkMedia.removeEventListener?.("change", onScheme); cancelAnimationFrame(scheduled); const geometries = new Set(), materials = new Set(); scene.traverse(o => { if (o.geometry) geometries.add(o.geometry); if (o.material) materials.add(o.material); }); geometries.forEach(g => g.dispose()); materials.forEach(m => m.dispose()); figA.continuous.dispose(); figB.continuous.dispose(); mapSurface?.dispose(); mapTarget?.dispose(); mapMaterial?.dispose(); bodyMapCache.clear(); skin.dispose(); skin2.dispose(); selected.dispose(); renderer?.dispose(); root.replaceChildren(); }
    };
  }
  return { create, describeCamera: M.describeCamera, describePose: M.describePose, describeScene: M.describeScene, PRESETS };
})();
