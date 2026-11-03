const CamPoseModel = (() => {
  const D2R = Math.PI / 180;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  /* ---------- tiny vector / matrix helpers (3x3 rotation matrices as flat arrays) ---------- */
  const v = (x, y, z) => [x, y, z];
  const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const mul = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const norm = a => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
  const rx = d => { const c = Math.cos(d * D2R), s = Math.sin(d * D2R); return [1, 0, 0, 0, c, -s, 0, s, c]; };
  const ry = d => { const c = Math.cos(d * D2R), s = Math.sin(d * D2R); return [c, 0, s, 0, 1, 0, -s, 0, c]; };
  const rz = d => { const c = Math.cos(d * D2R), s = Math.sin(d * D2R); return [c, -s, 0, s, c, 0, 0, 0, 1]; };
  const mm = (a, b) => {
    const o = new Array(9);
    for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) o[r * 3 + c] = a[r * 3] * b[c] + a[r * 3 + 1] * b[3 + c] + a[r * 3 + 2] * b[6 + c];
    return o;
  };
  const mv = (m, p) => [m[0] * p[0] + m[1] * p[1] + m[2] * p[2], m[3] * p[0] + m[4] * p[1] + m[5] * p[2], m[6] * p[0] + m[7] * p[1] + m[8] * p[2]];
  const chain = (...ms) => ms.reduce(mm);

  /* ---------- pose model ---------- */
  // Arm: raise = out to the side (0 down, 90 level, 180 overhead), fwd = forward (negative: behind),
  // bend = elbow. Leg: fwd = hip forward, side = out to the side, bend = knee.
  const limb = (a = 0, b = 0, c = 0, d = 0) => ({ a, b, c, d });
  const BASE = () => ({
    yaw: 0, pelvisPitch: 0, pelvisRoll: 0, lean: 0, side: 0, twist: 0,
    neckYaw: 0, neckPitch: 0, neckTilt: 0, headYaw: 0, headPitch: 0, headTilt: 0, seated: false,
    lArm: arm(), rArm: arm(), lLeg: leg(), rLeg: leg()
  });
  const arm = () => ({ ...limb(8, 0, 10), e: 0, wristPitch: 0, wristYaw: 0, wristRoll: 0, thumb: 12, index: 8, middle: 12, ring: 16, pinky: 20, spread: 5 });
  const leg = () => ({ ...limb(0, 4, 0), anklePitch: 0, ankleRoll: 0, toe: 0 });
  const P = o => {
    const p = Object.assign(BASE(), o);
    for (const k of ["lArm", "rArm", "lLeg", "rLeg"]) p[k] = Object.assign(k.endsWith("Arm") ? arm() : leg(), o[k]);
    return p;
  };

  const PRESETS = [
    { id: "stand", zh: "自然站立", en: "Standing", say: ["自然站立,双手垂放身侧", "standing relaxed with arms at the sides"], pose: P({}) },
    { id: "hips", zh: "双手叉腰", en: "Hands on hips", say: ["站立,双手叉腰", "standing with hands on hips"], pose: P({ lArm: limb(55, -10, 110, 80), rArm: limb(55, -10, 110, 80) }) },
    { id: "cross", zh: "双手抱胸", en: "Arms crossed", say: ["站立,双手抱胸", "standing with arms crossed"], pose: P({ lArm: limb(-9, 25, 110, 71), rArm: limb(-7, 23, 107, 72) }) },
    { id: "wave", zh: "挥手", en: "Waving", say: ["站立挥手打招呼", "standing and waving hello with one hand"], pose: P({ rArm: limb(85, 10, 105, -80), headTilt: 6 }) },
    { id: "cheer", zh: "双手举高", en: "Arms up", say: ["双手高举过头", "both arms raised high above the head"], pose: P({ lArm: limb(160, 10, 15), rArm: limb(160, 10, 15), headPitch: -12 }) },
    { id: "point", zh: "指向前方", en: "Pointing", say: ["一只手伸直指向远方", "pointing into the distance with one arm outstretched"], pose: P({ rArm: limb(15, 85, 0), headYaw: -10 }) },
    { id: "phone", zh: "打电话", en: "On the phone", say: ["一手拿手机贴在耳边打电话", "talking on the phone, holding it to the ear"], pose: P({ rArm: limb(-20, 100, 125, 40), headTilt: -8 }) },
    { id: "lookphone", zh: "低头看手机", en: "Looking at phone", say: ["低头看着手里的手机", "looking down at a phone held in both hands"], pose: P({ lArm: limb(10, 5, 95, 30), rArm: limb(10, 5, 95, 30), headPitch: 32 }) },
    { id: "think", zh: "托腮思考", en: "Thinking", say: ["一手托腮思考", "thinking with a hand on the chin"], pose: P({ rArm: limb(-20, 45, 135, 60), lArm: limb(12, 30, 100, 60), headTilt: 8, headPitch: 8 }) },
    { id: "walk", zh: "走路", en: "Walking", say: ["向前走路", "walking forward mid-stride"], pose: P({ lLeg: limb(22, 2, 8), rLeg: limb(-18, 2, 22), lArm: limb(8, -22, 15), rArm: limb(8, 24, 20) }) },
    { id: "run", zh: "奔跑", en: "Running", say: ["奔跑中", "running mid-stride"], pose: P({ lean: 14, lLeg: limb(55, 2, 75), rLeg: limb(-28, 2, 70), lArm: limb(10, -40, 95), rArm: limb(10, 50, 95) }) },
    { id: "sit", zh: "坐着", en: "Sitting", say: ["坐在凳子上,双手放在腿上", "sitting on a stool with hands resting on the lap"], pose: P({ seated: true, lLeg: limb(88, 6, 88), rLeg: limb(88, 6, 88), lArm: { ...limb(7, 10, 67, 25), wristPitch: 15 }, rArm: { ...limb(7, 10, 67, 25), wristPitch: 15 } }) },
    { id: "lookback", zh: "回眸", en: "Looking back", say: ["背对镜头,回头看向身后", "turned away and looking back over the shoulder"], pose: P({ yaw: 155, headYaw: 75, headTilt: 5 }) }
  ];

  // Body measurements (metres) for a ~1.75 m figure.
  const B = { pelvis: 0.95, spine: 0.45, neck: 0.1, head: 0.16, headR: 0.115, shoulder: 0.19, upper: 0.3, fore: 0.27, hand: 0.08, hip: 0.1, thigh: 0.45, shin: 0.45, foot: 0.15, seat: 0.48 };

  /** Joint positions for a pose (forward kinematics). */
  function skeleton(p) {
    // Positive body yaw and positive camera azimuth both turn toward -x (the subject's right).
    const body = chain(ry(-p.yaw), rx(p.pelvisPitch), rz(p.pelvisRoll));
    const upperBody = chain(body, rx(p.lean), rz(p.side), ry(-p.twist));
    const neckM = chain(upperBody, ry(-p.neckYaw), rx(p.neckPitch), rz(-p.neckTilt));
    const legDir = (L, s) => chain(body, rz(s * L.b), rx(-L.a), ry(-s * L.d));
    const pelvis0 = v(0, 0, 0);
    const J = {};
    J.pelvis = pelvis0;
    J.waist = add(pelvis0, mv(chain(body, rx(p.lean * 0.5), rz(p.side * 0.5)), v(0, 0.2, 0)));
    J.chest = add(J.waist, mv(upperBody, v(0, B.spine - 0.2, 0)));
    J.neck = add(J.chest, mv(neckM, v(0, B.neck, 0)));
    const headM = chain(neckM, ry(p.headYaw), rx(p.headPitch), rz(-p.headTilt));
    J.head = add(J.neck, mv(headM, v(0, B.head, 0)));
    J.headM = headM;
    for (const [side, s] of [["l", 1], ["r", -1]]) {
      const A = p[side + "Arm"];
      const sh = add(J.chest, mv(upperBody, v(s * B.shoulder, -0.02, 0)));
      // Raise out to the side about z, forward about x, twist inward (d) about the arm, then bend the elbow.
      const armM = chain(upperBody, rz(s * A.a), rx(-A.b), ry(-s * (A.d || 0)));
      const el = add(sh, mv(armM, v(0, -B.upper, 0)));
      const foreM = chain(armM, rx(-A.c), ry(-s * A.e));
      const handM = chain(foreM, rx(A.wristPitch), rz(s * A.wristYaw), ry(-s * A.wristRoll));
      const wr = add(el, mv(foreM, v(0, -B.fore, 0)));
      const hd = add(wr, mv(handM, v(0, -B.hand, 0)));
      J[side + "Shoulder"] = sh; J[side + "Elbow"] = el; J[side + "Wrist"] = wr; J[side + "Hand"] = hd;
      J[side + "ArmM"] = armM; J[side + "ForeM"] = foreM; J[side + "HandM"] = handM;
      const Lg = p[side + "Leg"];
      const hp = add(pelvis0, mv(body, v(s * B.hip, -0.04, 0)));
      const legM = legDir(Lg, s);
      const kn = add(hp, mv(legM, v(0, -B.thigh, 0)));
      const shinM = chain(legM, rx(Lg.c));
      const an = add(kn, mv(shinM, v(0, -B.shin, 0)));
      // Feet inherit hip and knee rotation. Ankle controls act in that local frame.
      const footM = chain(shinM, rx(Lg.anklePitch), rz(s * Lg.ankleRoll));
      const toe = add(an, mv(footM, v(0, -0.025, B.foot)));
      J[side + "Hip"] = hp; J[side + "Knee"] = kn; J[side + "Ankle"] = an; J[side + "Toe"] = toe;
      J[side + "LegM"] = legM; J[side + "ShinM"] = shinM; J[side + "FootM"] = footM;
    }
    // Stand on the ground, or sit on a stool.
    let lift;
    if (p.seated) lift = B.seat + 0.06;
    else {
      const sole = [];
      for (const side of ["l", "r"]) for (const x of [-0.047, 0.047]) for (const z of [-0.075, 0.17]) {
        const toeOffset = z > 0.1 ? mv(rx(-p[side + "Leg"].toe), v(x, -0.055, z - 0.1)) : v(x, -0.055, z - 0.1);
        const local = z > 0.1 ? add(v(0, 0, 0.1), toeOffset) : v(x, -0.055, z);
        sole.push(add(J[side + "Ankle"], mv(J[side + "FootM"], local))[1]);
      }
      lift = -Math.min(...sole) + 0.006;
    }
    for (const k in J) if (Array.isArray(J[k]) && J[k].length === 3) J[k] = add(J[k], v(0, lift, 0));
    J.forward = mv(body, v(0, 0, 1));
    J.ubM = upperBody; J.bodyM = body; J.neckM = neckM;
    J.headForward = mv(headM, v(0, 0, 1));
    return J;
  }

  /* ---------- physical camera: metres, one pose shared by the icon and preview ---------- */
  const CAMERA = { minDistance: 0.2, maxDistance: 8, fov: 45, guideRadius: 1.1, floor: 0.06 };
  const camDir = c => norm(v(-Math.sin(c.az * D2R) * Math.cos(c.el * D2R), Math.sin(c.el * D2R), Math.cos(c.az * D2R) * Math.cos(c.el * D2R)));
  function cameraTarget(cam, J) {
    if (cam.focus === 'head') return add(J.head, mv(J.headM, [0, -0.01, 0.09]));
    return add(J.chest, mv(J.ubM, [0, cam.focus === 'whole' ? -0.16 : -0.08, 0.1]));
  }
  const minCameraElevation = (distance, target) => Math.max(-60, Math.asin(clamp((CAMERA.floor - target[1]) / distance, -1, 1)) / D2R);
  function constrainToTarget(cam, target) {
    const c = normalizeCamera(cam);
    c.el = Math.max(Math.round(c.el * 10) / 10, Math.ceil(minCameraElevation(c.distance, target) * 10) / 10);
    return c;
  }
  function constrainCamera(cam, J) { return constrainToTarget(cam, cameraTarget(normalizeCamera(cam), J)); }
  function shotCamera(cam, J) {
    const target = cameraTarget(normalizeCamera(cam), J), camera = constrainToTarget(cam, target);
    return { target, pos: add(target, mul(camDir(camera), camera.distance)), fov: CAMERA.fov, camera };
  }
  // Compatibility entry point; no hidden reframing or field-of-view changes.
  const framedCamera = (cam, J) => shotCamera(cam, J);
  function cameraBounds(J) {
    const points = Object.entries(J).filter(([k, p]) => Array.isArray(p) && p.length === 3 && !/forward/i.test(k)).map(([, p]) => p);
    const min = [0, 1, 0].map((_, i) => Math.min(...points.map(p => p[i])) - (i === 1 ? 0.06 : 0.09));
    const max = [0, 1, 0].map((_, i) => Math.max(...points.map(p => p[i])) + (i === 1 ? 0.14 : 0.09));
    return { min, max };
  }
  function fitCameraDistance(cam, J, aspect = 1, bounds = cameraBounds(J)) {
    const target = cameraTarget(normalizeCamera(cam), J), vf = Math.tan(CAMERA.fov * D2R / 2), hf = vf * aspect;
    let distance = 0.2;
    // At low angles a longer distance raises the floor limit; solve the final geometry together.
    for (let pass = 0; pass < 12; pass++) {
      const c = constrainToTarget({ ...normalizeCamera(cam), distance }, target), direction = camDir(c);
      const right = norm(cross([0, 1, 0], direction)), up = cross(direction, right);
      let required = 0.2;
      for (const x of [bounds.min[0], bounds.max[0]]) for (const y of [bounds.min[1], bounds.max[1]]) for (const z of [bounds.min[2], bounds.max[2]]) {
        const d = sub([x, y, z], target);
        required = Math.max(required, dot(d, direction) + Math.max(Math.abs(dot(d, right)) / hf, Math.abs(dot(d, up)) / vf) * 1.15);
      }
      distance = Math.max(distance, required);
    }
    return clamp(distance, CAMERA.minDistance, CAMERA.maxDistance);
  }
  function cameraControlPoint(cam, id, target) {
    const c = constrainToTarget(cam, target);
    if (id === 'az') return add([target[0], 0.012, target[2]], mul(camDir({ az: c.az, el: 0 }), 1.35));
    return add(target, mul(camDir(c), id === 'distance' ? c.distance : CAMERA.guideRadius));
  }
  function dragCameraControl(cam, id, pointer, project, center) {
    const c = normalizeCamera(cam), current = c[id];
    const range = id === 'distance' ? Math.min(0.9, Math.max(0.2, current * 0.4)) : 25;
    const step = id === 'distance' ? 0.0025 : 0.25;
    const origin = project(cameraControlPoint(c, id, center));
    let best = current, score = origin ? (origin.x - pointer.x) ** 2 + (origin.y - pointer.y) ** 2 : Infinity;
    for (let delta = -range; delta <= range + step / 2; delta += step) {
      const value = id === 'az' ? ((current + delta) % 360 + 360) % 360 : clamp(current + delta, id === 'el' ? -60 : CAMERA.minDistance, id === 'el' ? 85 : CAMERA.maxDistance);
      const point = project(cameraControlPoint({ ...c, [id]: value }, id, center)); if (!point) continue;
      const cost = (point.x - pointer.x) ** 2 + (point.y - pointer.y) ** 2 + delta * delta * (id === 'distance' ? 0.002 : 0.025);
      if (cost < score) { score = cost; best = value; }
    }
    return best;
  }

  /* ---------- projection ---------- */
  function makeView(eye, target, fovDeg, w, h) {
    const f = norm(sub(target, eye));
    const r = norm(cross(f, v(0, 1, 0)));
    const u = cross(r, f);
    const k = (h / 2) / Math.tan(fovDeg * D2R / 2);
    return {
      eye, f, r, u, w, h,
      project(p) {
        const d = sub(p, eye);
        const z = dot(d, f);
        if (z < 0.05) return null;
        return { x: w / 2 + dot(d, r) * k / z, y: h / 2 - dot(d, u) * k / z, z, s: k / z };
      }
    };
  }

  /* ---------- describing the shot and pose in words ---------- */
  const AZ = [
    ["正面视角", "front view"], ["右前方四分之三侧面", "front-right three-quarter view"], ["右侧面", "right side view, in profile"],
    ["右后方四分之三背面", "back-right three-quarter view"], ["背面视角", "back view"], ["左后方四分之三背面", "back-left three-quarter view"],
    ["左侧面", "left side view, in profile"], ["左前方四分之三侧面", "front-left three-quarter view"]
  ];
  function elWords(el) {
    if (el < -20) return ["低角度仰拍", "low angle shot, looking up at the subject"];
    if (el < -7) return ["略微仰拍", "slightly low angle"];
    if (el <= 7) return ["平视", "eye level"];
    if (el <= 25) return ["略微俯拍", "slightly high angle"];
    if (el <= 50) return ["高角度俯拍", "high angle shot, looking down at the subject"];
    return ["鸟瞰俯视", "bird's-eye view from above"];
  }
  // Shot size from what the camera actually sees: the lowest body landmark still in frame.
  function shotWords(cam, J, aspect = 1) {
    const c = normalizeCamera(cam), spec = shotCamera(c, J), W = 100 * aspect;
    const view = makeView(spec.pos, spec.target, spec.fov, W, 100);
    const inFrame = p => { const q = view.project(p); return !!q && q.x >= -0.5 && q.x <= W + 0.5 && q.y >= -0.5 && q.y <= 100.5; };
    const top = add(J.head, mv(J.headM, [0, 0.125, 0])), chin = add(J.head, mv(J.headM, [0, -0.11, 0.04]));
    const headIn = inFrame(top) && inFrame(chin);
    // Feet count as in frame when the ankles are (toes right at the edge still read as a full-body shot).
    const nearFrame = p => { const q = view.project(p); return !!q && q.x >= -4 && q.x <= W + 4 && q.y >= -4 && q.y <= 104; };
    const feetIn = ["lAnkle", "rAnkle"].every(k => nearFrame(J[k]));
    if (headIn && feetIn) {
      const ys = Object.values(J).filter(p => Array.isArray(p) && p.length === 3).map(p => view.project(p)).filter(Boolean).map(p => p.y);
      return Math.max(...ys) - Math.min(...ys) < 45 ? ["远景", "wide shot, the whole figure small in the frame"] : ["全身景", "full shot, whole body in frame"];
    }
    // With the face in frame, the lowest landmark still visible names the shot (a cropped crown is fine).
    if (headIn || inFrame(J.head)) {
      const midChest = add(J.chest, mv(J.ubM, [0, -0.17, 0.05]));
      if (inFrame(J.lKnee) || inFrame(J.rKnee)) return ["中全景", "medium full shot, from the knees up"];
      if (inFrame(J.pelvis)) return ["中景", "medium shot, from the waist up"];
      if (inFrame(midChest)) return ["近景", "medium close-up, from the chest up"];
      return headIn ? ["特写", "close-up of the face"] : ["大特写", "extreme close-up of the face"];
    }
    return ["局部特写", "close-up of part of the body, the head out of frame"];
  }
  function describeCamera(cam, lang, yaw = 0, J = skeleton(BASE()), aspect = 1) {
    const c = constrainCamera(cam, J), i = lang === 'zh' ? 0 : 1, rel = c.az - yaw;
    const az = AZ[Math.round((((rel % 360) + 360) % 360) / 45) % 8][i];
    return [az, elWords(c.el)[i], shotWords(c, J, aspect)[i]].join(lang === 'zh' ? ',' : ', ');
  }

  // [zh one arm, en one arm, zh both arms, en both arms]
  function armWords(A) {
    if (A.a > 135 || A.b > 140) return ["手臂高举过头", "arm raised overhead", "双手高举过头", "both arms raised overhead"];
    if (A.b > 60 && A.c < 50) return ["手臂向前伸直", "arm reaching forward", "双臂向前伸直", "both arms reaching forward"];
    if (A.a > 60 && A.c < 60) return ["手臂向侧面张开", "arm stretched out to the side", "双臂向两侧张开", "arms stretched out to the sides"];
    if (A.a > 70) return ["手举起来", "hand raised up", "双手举起", "both hands raised"];
    if (A.c > 85 && A.a >= 20 && A.a <= 65 && A.b < 20) return ["手叉在腰上", "hand on the hip", "双手叉腰", "hands on hips"];
    if (A.c > 120 && A.b >= 10) return ["手抬到脸旁", "hand raised to the face", "双手抬到脸旁", "both hands raised to the face"];
    if (A.c > 60 && A.b > 15) return ["手臂弯曲在胸前", "arm bent in front of the chest", "双臂弯曲在胸前", "both arms bent in front of the chest"];
    if (A.b < -20) return ["手臂向后摆", "arm swinging back", "双臂向后摆", "both arms swinging back"];
    return null;
  }

  function describePose(p, cam, lang) {
    const zh = lang === "zh";
    const i = zh ? 0 : 1;
    const parts = [];
    const preset = p.preset && PRESETS.find(x => x.id === p.preset);
    if (preset) {
      // A preset names an action; its facing must still follow the current camera.
      const rel = cam ? Math.abs((((p.yaw - cam.az) % 360) + 540) % 360 - 180) : 180;
      parts.push(preset.id === "lookback" && rel < 110 ? (zh ? "站立,回头看向肩后" : "standing, looking over the shoulder") : preset.say[i]);
    }
    else {
      const bentKnees = p.lLeg.c > 55 && p.rLeg.c > 55;
      if (p.seated) parts.push(zh ? "坐着" : "sitting");
      else if (bentKnees && p.lLeg.a > 50 && p.rLeg.a > 50) parts.push(zh ? "蹲着" : "crouching");
      else if (Math.abs(p.lLeg.a - p.rLeg.a) > 30) parts.push(zh ? "迈步向前" : "mid-stride");
      else parts.push(zh ? "站立" : "standing");
      if (p.lean > 15) parts.push(zh ? "身体前倾" : "leaning forward");
      else if (p.lean < -12) parts.push(zh ? "身体后仰" : "leaning back");
      if (Math.abs(p.side) > 12) parts.push(zh ? "身体向一侧倾斜" : "body tilted to one side");
      const l = armWords(p.lArm), r = armWords(p.rArm);
      if (l && r && l[1] === r[1]) parts.push(l[i + 2]);
      else {
        if (l) parts.push((zh ? "左" : "left ") + l[i]);
        if (r) parts.push((zh ? "右" : "right ") + r[i]);
      }
      if (p.lLeg.c > 55 && !p.seated && p.lLeg.a > 40 && p.rLeg.a < 25) parts.push(zh ? "抬起左膝" : "left knee raised");
      if (p.rLeg.c > 55 && !p.seated && p.rLeg.a > 40 && p.lLeg.a < 25) parts.push(zh ? "抬起右膝" : "right knee raised");
      if (p.headYaw > 25) parts.push(zh ? "头转向自己的左边" : "head turned to their left");
      else if (p.headYaw < -25) parts.push(zh ? "头转向自己的右边" : "head turned to their right");
      if (p.headPitch > 15) parts.push(zh ? "低头" : "looking down");
      else if (p.headPitch < -15) parts.push(zh ? "抬头向上看" : "looking up");
      if (Math.abs(p.headTilt) > 12) parts.push(zh ? "微微歪头" : "head tilted");
      if (Math.abs(p.twist) > 12) parts.push(zh ? `胸腰扭转约${Math.round(Math.abs(p.twist))}度` : `torso twisted about ${Math.round(Math.abs(p.twist))} degrees`);
      if (Math.abs(p.pelvisPitch) > 12 || Math.abs(p.pelvisRoll) > 12) parts.push(zh ? "骨盆倾斜" : "pelvis tilted");
      if (Math.abs(p.neckYaw) > 15 || Math.abs(p.neckPitch) > 15 || Math.abs(p.neckTilt) > 15) parts.push(zh ? "颈部转动倾斜" : "neck turned or tilted");
      for (const [s, side] of [["l", zh ? "左" : "left "], ["r", zh ? "右" : "right "]]) {
        const A = p[s + "Arm"], leg = p[s + "Leg"];
        if (A.c > 25 && !armWords(A)) parts.push(zh ? `${side}肘弯曲约${Math.round(A.c)}度` : `${side}elbow bent about ${Math.round(A.c)} degrees`);
        if (Math.abs(A.e) > 25) parts.push(zh ? `${side}前臂旋转` : `${side}forearm rotated`);
        if (Math.abs(A.wristPitch) > 20 || Math.abs(A.wristYaw) > 15 || Math.abs(A.wristRoll) > 20) parts.push(zh ? `${side}手腕弯曲转动` : `${side}wrist bent or rotated`);
        const curls = [A.index, A.middle, A.ring, A.pinky];
        if (curls.every(n => n > 65)) parts.push(zh ? `${side}手握拳` : `${side}hand in a fist`);
        else if (A.index < 15 && curls.slice(1).every(n => n > 65)) parts.push(zh ? `${side}食指伸直，其余手指弯曲` : `${side}index finger extended, other fingers curled`);
        else if (curls.every(n => n < 15) && A.spread > 12) parts.push(zh ? `${side}手张开五指` : `${side}hand open with fingers spread`);
        if (Math.abs(leg.d) > 20) parts.push(zh ? `${side}髋旋转` : `${side}hip rotated`);
        if (Math.abs(leg.anklePitch) > 15 || Math.abs(leg.ankleRoll) > 12) parts.push(zh ? `${side}脚踝屈伸` : `${side}ankle flexed`);
        if (Math.abs(leg.toe) > 15) parts.push(zh ? `${side}脚趾弯曲` : `${side}toes bent`);
      }
    }
    // Which way the body faces relative to the camera.
    if (cam) {
      const rel = ((((p.yaw - cam.az) % 360) + 540) % 360) - 180; // 0 = facing the camera
      const a = Math.abs(rel);
      const facing = a < 25 ? ["身体正对镜头", "body facing the camera"]
        : a < 70 ? ["身体微微侧向一边", "body turned slightly to the side"]
        : a < 110 ? ["身体侧对镜头", "body in profile to the camera"]
        : a < 155 ? ["身体大半背对镜头", "body turned mostly away from the camera"]
        : ["背对镜头", "back to the camera"];
      if (!(preset && preset.id === "lookback" && a >= 110)) parts.push(facing[i]);
    }
    return parts.join(zh ? "," : ", ");
  }

  /* ---------- text ---------- */
  const T = {
    zh: { camera: "镜头", pose: "姿势", view: "镜头画面", reset: "重置", az: "水平角度", el: "上下角度", dist: "距离", azHint: "0°=正面 · 90°=右侧 · 180°=背面 · 270°=左侧", elHint: "负数=仰拍 · 0°=平视 · 正数=俯拍", distHint: "小=特写 · 大=远景",
      dragCam: "拖动彩色圆点:绿色=水平角度,粉色=上下角度,橙色=距离。拖动空白处可以转动视角。", dragPose: "点人物身上的圆点选择部位,再拖动它调整;拖动空白处可以转动视角。",
      parts: { body: "身体", head: "头部", lArm: "左手", rArm: "右手", lLeg: "左腿", rLeg: "右腿" },
      sliders: { yaw: "转身", lean: "前倾 / 后仰", side: "侧弯", headYaw: "左右转头", headPitch: "抬头 / 低头", headTilt: "歪头", a: "向侧面抬起", b: "向前抬起", c: "手肘弯曲", d: "向内转", legA: "向前抬腿", legB: "向外张开", legC: "膝盖弯曲" },
      seated: "坐着(加一张凳子)", presets: "常用姿势", camPresets: "常用角度", output: "提示词" },
    en: { camera: "Camera", pose: "Pose", view: "Camera view", reset: "Reset", az: "Azimuth", el: "Elevation", dist: "Distance", azHint: "0°=front · 90°=right · 180°=back · 270°=left", elHint: "negative=low angle · 0°=eye level · positive=high angle", distHint: "small=close-up · large=wide",
      dragCam: "Drag the colored handles: green = azimuth, pink = elevation, orange = distance. Drag empty space to orbit the view.", dragPose: "Click a dot on the figure to pick a body part, then drag it; drag empty space to orbit the view.",
      parts: { body: "Body", head: "Head", lArm: "Left arm", rArm: "Right arm", lLeg: "Left leg", rLeg: "Right leg" },
      sliders: { yaw: "Turn", lean: "Lean fwd / back", side: "Side bend", headYaw: "Turn head", headPitch: "Look up / down", headTilt: "Tilt head", a: "Raise to side", b: "Raise forward", c: "Bend elbow", d: "Twist inward", legA: "Lift forward", legB: "Spread out", legC: "Bend knee" },
      seated: "Sitting (adds a stool)", presets: "Common poses", camPresets: "Common angles", output: "Prompt" }
  };
  const CAM_PRESETS = [
    { zh: '正面平视', en: 'Front, eye level', c: { az: 0, el: 0, distance: 2.8, focus: 'chest' } },
    { zh: '四分之三侧面', en: 'Three-quarter', c: { az: 45, el: 10, distance: 2.8, focus: 'chest' } },
    { zh: '侧面', en: 'Profile', c: { az: 90, el: 0, distance: 2.8, focus: 'chest' } },
    { zh: '背影', en: 'From behind', c: { az: 180, el: 10, distance: 3.5, focus: 'chest' } },
    { zh: '仰拍全身', en: 'Low-angle full body', fit: true, c: { az: 20, el: -25, distance: 3.5, focus: 'whole' } },
    { zh: '俯拍', en: 'High angle', c: { az: 30, el: 40, distance: 2.8, focus: 'chest' } },
    { zh: '脸部特写', en: 'Face close-up', c: { az: 15, el: 5, distance: 0.65, focus: 'head' } },
    { zh: '大远景', en: 'Wide establishing', c: { az: 30, el: 20, distance: 7, focus: 'whole' } }
  ];

  // Explicit paths keep independent joints editable without relying on the selected limb.
  const control = (path, zh, en, min, max) => ({ path, zh, en, min, max });
  const PARTS = {
    body: { zh: "骨盆 / 转身", en: "Pelvis / turn", joint: "pelvis", controls: [control("yaw", "转身", "Body turn", -180, 180), control("pelvisPitch", "骨盆前后倾", "Pelvis tilt", -30, 30), control("pelvisRoll", "骨盆侧倾", "Pelvis side tilt", -25, 25)] },
    chest: { zh: "胸腰", en: "Spine / chest", joint: "chest", controls: [control("lean", "前倾 / 后仰", "Lean forward / back", -30, 60), control("side", "侧弯", "Side bend", -30, 30), control("twist", "胸腰扭转", "Spine twist", -60, 60)] },
    neck: { zh: "颈部", en: "Neck", joint: "neck", controls: [control("neckYaw", "颈部转动", "Neck turn", -40, 40), control("neckPitch", "颈部俯仰", "Neck nod", -25, 35), control("neckTilt", "颈部侧倾", "Neck tilt", -25, 25)] },
    head: { zh: "头部", en: "Head", joint: "head", controls: [control("headYaw", "左右转头", "Turn head", -80, 80), control("headPitch", "低头 / 抬头", "Look down / up", -40, 45), control("headTilt", "歪头", "Tilt head", -30, 30)] }
  };
  for (const [s, zh, en] of [["l", "左", "Left"], ["r", "右", "Right"]]) {
    const A = s + "Arm.", L = s + "Leg.";
    PARTS[s + "Arm"] = { zh: zh + "肩", en: en + " shoulder", joint: s + "Shoulder", controls: [control(A + "a", "向侧面抬臂", "Raise to side", -35, 180), control(A + "b", "向前 / 向后抬臂", "Raise forward / back", -60, 180), control(A + "d", "肩部内外旋", "Shoulder rotation", -90, 120)] };
    PARTS[s + "Elbow"] = { zh: zh + "肘 / 前臂", en: en + " elbow", joint: s + "Elbow", controls: [control(A + "c", "手肘弯曲", "Elbow bend", 0, 150), control(A + "e", "前臂旋转", "Forearm rotation", -90, 90)] };
    PARTS[s + "Hand"] = { zh: zh + "手腕", en: en + " wrist", joint: s + "Wrist", controls: [control(A + "wristPitch", "手腕屈伸", "Wrist flex / extend", -70, 80), control(A + "wristYaw", "手腕侧偏", "Wrist side bend", -30, 30), control(A + "wristRoll", "手掌旋转", "Palm rotation", -60, 60)] };
    PARTS[s + "Fingers"] = { zh: zh + "手指", en: en + " fingers", joint: s + "Hand", controls: [control(A + "thumb", "拇指弯曲", "Thumb curl", 0, 90), control(A + "index", "食指弯曲", "Index curl", 0, 100), control(A + "middle", "中指弯曲", "Middle curl", 0, 100), control(A + "ring", "无名指弯曲", "Ring curl", 0, 100), control(A + "pinky", "小指弯曲", "Pinky curl", 0, 100), control(A + "spread", "手指张开", "Finger spread", 0, 22)] };
    PARTS[s + "Leg"] = { zh: zh + "髋", en: en + " hip", joint: s + "Hip", controls: [control(L + "a", "向前 / 向后抬腿", "Lift forward / back", -40, 120), control(L + "b", "髋部外展", "Hip spread", -10, 65), control(L + "d", "髋部内外旋", "Hip rotation", -45, 60)] };
    PARTS[s + "Knee"] = { zh: zh + "膝", en: en + " knee", joint: s + "Knee", controls: [control(L + "c", "膝盖弯曲", "Knee bend", 0, 145)] };
    PARTS[s + "Foot"] = { zh: zh + "脚踝 / 脚趾", en: en + " ankle / toes", joint: s + "Ankle", controls: [control(L + "anklePitch", "脚踝屈伸", "Ankle flex / extend", -45, 60), control(L + "ankleRoll", "脚踝内外翻", "Ankle roll", -25, 25), control(L + "toe", "脚趾弯曲", "Toe bend", -20, 60)] };
  }
  const get = (p, path) => path.split(".").reduce((o, k) => o[k], p);
  const put = (p, path, value) => { const keys = path.split("."); const key = keys.pop(); keys.reduce((o, k) => o[k], p)[key] = value; };
  const wrap360 = a => ((a % 360) + 360) % 360;
  const finite = (x, fallback) => typeof x === "number" && Number.isFinite(x) ? x : fallback;
  function normalizePose(raw = {}) {
    if (!raw || typeof raw !== "object") raw = {};
    const p = BASE();
    for (const part of Object.values(PARTS)) for (const c of part.controls) {
      let value = c.path.split(".").reduce((o, k) => o && o[k], raw);
      put(p, c.path, clamp(finite(value, get(p, c.path)), c.min, c.max));
    }
    p.seated = raw.seated === true;
    p.preset = PRESETS.some(x => x.id === raw.preset) ? raw.preset : null;
    return p;
  }
  function normalizeCamera(raw = {}) {
    if (!raw || typeof raw !== 'object') raw = {};
    const old = clamp(finite(raw.dist, 1), 0.6, 1.4);
    const legacy = old <= 1 ? 0.65 + (old - 0.6) / 0.4 * 2.15 : 2.8 + (old - 1) / 0.4 * 4.2;
    return { version: 2, az: wrap360(finite(raw.az, 45)), el: clamp(finite(raw.el, 10), -60, 85), distance: clamp(finite(raw.distance, legacy), CAMERA.minDistance, CAMERA.maxDistance), focus: ['head', 'chest', 'whole'].includes(raw.focus) ? raw.focus : 'chest' };
  }

  return { D2R, clamp, v, add, sub, mul, dot, cross, norm, rx, ry, rz, mv, chain, BASE, P, PRESETS, B, skeleton, CAMERA, camDir, shotCamera, framedCamera, cameraTarget, cameraBounds, constrainCamera, minCameraElevation, fitCameraDistance, cameraControlPoint, dragCameraControl, makeView, describeCamera, describePose, T, CAM_PRESETS, PARTS, get, put, wrap360, normalizePose, normalizeCamera };
})();
