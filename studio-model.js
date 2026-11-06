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
    body: "male", x: 0, z: 0, props: [],
    lArm: arm(), rArm: arm(), lLeg: leg(), rLeg: leg()
  });

  // Editor proportions; visual body variants come from the pinned anatomical mesh.
  const BODY_TYPES = {
    male: { zh: "成年男性", en: "Adult man", height: 1 },
    female: { zh: "成年女性", en: "Adult woman", height: 0.94, say: ["成年女性", "an adult woman"], proportions: { shoulder: 0.166, hip: 0.108, spine: 0.435, neck: 0.088, head: 0.15, headSize: 0.98, handSize: 0.87, footSize: 0.94 } },
    slim: { zh: "纤瘦", en: "Slim", height: 1, say: ["身材纤瘦", "slim build"], proportions: { shoulder: 0.177, hip: 0.092, handSize: 1, footSize: 0.96 } },
    strong: { zh: "健壮", en: "Muscular", height: 1.02, say: ["身材健壮", "muscular build"], proportions: { shoulder: 0.215, hip: 0.103, neck: 0.095, handSize: 1, footSize: 1.03 } },
    child: { zh: "小孩", en: "Child", height: 0.76, say: ["小孩", "a child"], proportions: { shoulder: 0.147, hip: 0.082, spine: 0.40, neck: 0.065, head: 0.17, upper: 0.235, fore: 0.205, hand: 0.085, thigh: 0.34, shin: 0.32, foot: 0.12, headSize: 1.17, handSize: 0.77, footSize: 0.82 } }
  };
  // Hand props and furniture; hand props sit in the right hand.
  const PROPS = {
    phone: { zh: "手机", en: "Phone", hand: true, say: ["右手拿着手机", "holding a phone in the right hand"] },
    cup: { zh: "杯子", en: "Cup", hand: true, say: ["右手拿着一个杯子", "holding a cup in the right hand"] },
    umbrella: { zh: "雨伞", en: "Umbrella", hand: true, say: ["右手撑着一把伞", "holding an open umbrella in the right hand"] },
    book: { zh: "书", en: "Book", hand: true, say: ["右手拿着一本书", "holding a book in the right hand"] },
    chair: { zh: "椅子", en: "Chair", say: ["旁边有一把椅子", "a chair beside them"], seatSay: ["坐在椅子上", "sitting on a chair"] },
    table: { zh: "桌子", en: "Table", say: ["面前有一张桌子", "a table in front of them"] }
  };
  // A relaxed hand: forearm turned so the palm faces the thigh, thumb tucked in, fingers softly curled.
  const REST_FOREARM = 75;
  // The pose the anatomical mesh was compiled in (tools/build-body.cjs). Kept fixed so changing the
  // everyday defaults above never moves the mesh's reference frame.
  const BIND_ARM = { a: 25, b: 0, c: 5, d: 0, e: 0, wristPitch: 0, wristYaw: 0, wristRoll: 0, thumb: 12, index: 8, middle: 12, ring: 16, pinky: 20, spread: 5 };
  const bindPose = (body = "male") => { const p = BASE(); p.body = body; p._bindReference = true; Object.assign(p.lArm, BIND_ARM); Object.assign(p.rArm, BIND_ARM); return p; };
  const arm = () => ({ ...limb(8, 0, 10), e: REST_FOREARM, wristPitch: 0, wristYaw: 0, wristRoll: 0, thumb: 32, index: 14, middle: 18, ring: 22, pinky: 26, spread: 2 });
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
  const B = { pelvis: 0.95, spine: 0.45, neck: 0.1, head: 0.16, headR: 0.115, shoulder: 0.19, upper: 0.3, fore: 0.27, hand: 0.11, hip: 0.1, thigh: 0.45, shin: 0.45, foot: 0.15, seat: 0.48 };

  const measurements = body => ({ ...B, headSize: 1, handSize: 1, footSize: 1, ...(BODY_TYPES[body] || BODY_TYPES.male).proportions });

  /** Joint positions for a pose (forward kinematics). */
  function skeleton(p) {
    const B = measurements(p.body);
    // Positive body yaw and positive camera azimuth both turn toward -x (the subject's right).
    const body = chain(ry(-p.yaw), rx(p.pelvisPitch), rz(p.pelvisRoll));
    const upperBody = chain(body, rx(p.lean), rz(p.side), ry(-p.twist));
    const neckM = chain(upperBody, ry(-p.neckYaw), rx(p.neckPitch), rz(-p.neckTilt));
    const legDir = (L, s) => chain(body, rx(-L.a), rz(s * L.b), ry(-s * L.d));
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
      const shoulderLift = clamp((Math.max(A.a, A.b) - 55) / 125, 0, 1) * 12;
      const clavicleM = chain(upperBody, rz(s * shoulderLift));
      const sh = add(J.chest, mv(clavicleM, v(s * B.shoulder, -0.02, 0)));
      // Raise out to the side about z, forward about x, twist inward (d) about the arm, then bend the elbow.
      const armM = chain(clavicleM, rx(-A.b), rz(s * A.a), ry(-s * (A.d || 0)));
      const el = add(sh, mv(armM, v(0, -B.upper, 0)));
      const foreM = chain(armM, rx(-A.c), ry(-s * A.e));
      const handM = chain(foreM, rx(A.wristPitch), rz(s * A.wristYaw), ry(-s * A.wristRoll));
      const wr = add(el, mv(foreM, v(0, -B.fore, 0)));
      const hd = add(wr, mv(handM, v(0, -B.hand, 0)));
      J[side + "Shoulder"] = sh; J[side + "Elbow"] = el; J[side + "Wrist"] = wr; J[side + "Hand"] = hd;
      J[side + "ArmM"] = armM; J[side + "ForeM"] = foreM; J[side + "HandM"] = handM;
      J[side + "ClavicleM"] = clavicleM;
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
    if (collisionSurface && !p._bindReference) lift = Math.max(surfaceGroundLift(p, J, B), p.seated ? B.seat + 0.06 : -Infinity);
    else {
      const sole = [];
      for (const side of ["l", "r"]) for (const x0 of [-0.047, 0.047]) for (const z0 of [-0.075, 0.17]) {
        const x = x0 * B.footSize, z = z0 * B.footSize;
        const pivot = 0.1 * B.footSize, soleY = -0.055 * B.footSize;
        const toeOffset = mv(rx(-p[side + "Leg"].toe), v(x, soleY, z - pivot));
        const local = z > pivot ? add(v(0, 0, pivot), toeOffset) : v(x, soleY, z);
        sole.push(add(J[side + "Ankle"], mv(J[side + "FootM"], local))[1]);
      }
      lift = Math.max(-Math.min(...sole) + 0.006, p.seated ? B.seat + 0.06 : -Infinity);
    }
    // Shorter body types scale every joint from the floor; x / z place a second person.
    const h = (BODY_TYPES[p.body] || BODY_TYPES.male).height;
    for (const k in J) if (Array.isArray(J[k]) && J[k].length === 3) {
      const q = add(J[k], v(0, lift, 0));
      J[k] = [q[0] * h + (p.x || 0), q[1] * h, q[2] * h + (p.z || 0)];
    }
    J.scale = h;
    J.headSize = h * B.headSize; J.handSize = h * B.handSize; J.footSize = h * B.footSize;
    J.forward = mv(body, v(0, 0, 1));
    J.ubM = upperBody; J.bodyM = body; J.neckM = neckM;
    J.headForward = mv(headM, v(0, 0, 1));
    return J;
  }

  // The palm and all three phalanges use one hand frame, shared by the skin and props.
  // Measured from the anatomical mesh (adult man, hand frame, metres at handSize 1) so the mesh
  // hand keeps its real palm and finger proportions instead of being squashed to a smaller rig.
  const FINGERS = {
    thumb: { root: [0.0284, -0.0436, 0.0041], lengths: [0.0358, 0.0424, 0.0322] },
    index: { root: [0.0303, -0.1202, 0.0054], lengths: [0.0301, 0.0270, 0.0310] },
    middle: { root: [0, -0.1195, 0], lengths: [0.0392, 0.0319, 0.0313] },
    ring: { root: [-0.0226, -0.1126, -0.0005], lengths: [0.0346, 0.0289, 0.0309] },
    pinky: { root: [-0.0441, -0.1013, 0.0054], lengths: [0.0248, 0.0181, 0.0231] }
  };
  const PALM = { width: 0.077, length: 0.1195 };

  function handRig(p, side, J = skeleton(p)) {
    const sign = side === 'l' ? 1 : -1, A = p[side + 'Arm'], scale = J.handSize, R = J[side + 'HandM'];
    const result = {};
    Object.entries(FINGERS).forEach(([name, spec], index) => {
      let point = add(J[side + 'Wrist'], mv(R, mul([spec.root[0] * sign, spec.root[1], spec.root[2]], scale)));
      const spread = name === 'thumb' ? sign * (40 - A.thumb * 0.65) : sign * (2.5 - index) * A.spread;
      let matrix = chain(R, rz(spread));
      spec.lengths.forEach((length, segment) => {
        const curl = A[name] * (name === 'thumb' ? [0.5, 0.7, 0.5] : [0.55, 0.85, 0.6])[segment];
        matrix = chain(matrix, rx(-curl));
        result[side + name + segment] = { position: point, matrix, length: length * scale };
        point = add(point, mv(matrix, [0, -length * scale, 0]));
      });
      result[side + name + 'Tip'] = point;
    });
    return result;
  }
  function skinFrames(p, J = skeleton(p)) {
    const frame = (position, matrix) => ({ position, matrix });
    const frames = { pelvis: frame(J.pelvis, J.bodyM), torso: frame(J.waist, J.ubM), neck: frame(J.chest, J.neckM), head: frame(J.head, J.headM) };
    for (const side of ['l', 'r']) {
      frames[side + 'Clavicle'] = frame(J.chest, J[side + 'ClavicleM']);
      for (const [name, joint, rotation] of [['Upper', 'Shoulder', 'ArmM'], ['Fore', 'Elbow', 'ForeM'], ['Hand', 'Wrist', 'HandM'], ['Thigh', 'Hip', 'LegM'], ['Shin', 'Knee', 'ShinM'], ['Foot', 'Ankle', 'FootM']]) frames[side + name] = frame(J[side + joint], J[side + rotation]);
      // Pronation turns gradually from the stable elbow to the wrist. Rotating the
      // entire forearm at the elbow collapses its blend with the upper arm.
      const A = p[side + 'Arm'], sign = side === 'l' ? 1 : -1;
      for (const [name, fraction] of [['ForeBase', 0], ['ForeMid', 1 / 3], ['ForeDist', 2 / 3]]) {
        frames[side + name] = frame(J[side + 'Elbow'], chain(J[side + 'ArmM'], rx(-A.c), ry(-sign * A.e * fraction)));
      }
      frames[side + 'Toes'] = frame(add(J[side + 'Ankle'], mv(J[side + 'FootM'], mul([0, -0.02, 0.10], J.footSize))), chain(J[side + 'FootM'], rx(-p[side + 'Leg'].toe)));
      for (const [key, value] of Object.entries(handRig(p, side, J))) if (value.matrix) frames[key] = value;
    }
    return frames;
  }
  // Finger curls and attachment points solved against the measured hand so fingertips rest on the
  // phone / book back and wrap the cup and umbrella handle.
  // Finger curls solved against the measured hand: the phone lies across the palm with the fingers
  // wrapped round its far edge and the thumb on the near edge; the umbrella handle and the cup sit
  // against the palm with the fingers closed round them.
  const GRIPS = {
    phone: { curls: [34, 88, 92, 84, 60] },
    cup: { curls: [46, 84, 80, 74, 66] },
    umbrella: { curls: [40, 70, 80, 84, 70] },
    book: { curls: [32, 99, 99, 99, 95] }
  };
  // Where each prop sits in the hand (hand frame: x toward the index finger, -y along the fingers,
  // +z out of the palm; the palm surface is about 3 cm out). Each prop rests against the palm.
  const PROP_ATTACHMENTS = {
    // Phone: back against the palm, long side across the hand (top past the index finger), screen outward.
    phone: { position: [0.03, -0.075, 0.036], matrix: [0, 1, 0, 1, 0, 0, 0, 0, -1] },
    book: { position: [0.050, -0.100, 0.043], angles: [0, 0, 0] },
    cup: { position: [0, -0.06, 0.07], angles: [0, 30, 90] },
    umbrella: { position: [0.01, -0.1, 0.045], angles: [0, 30, 90] }
  };
  // The prop's rotation in the hand frame: an explicit matrix, or x / y / z angles.
  const attachRotation = a => a.matrix || chain(rx(a.angles[0]), ry(a.angles[1]), rz(a.angles[2]));
  // On a call the phone runs up the palm instead: back in the palm, screen to the ear (palm side).
  const PHONE_AT_EAR = { position: [0, -0.1, 0.035], matrix: [1, 0, 0, 0, -1, 0, 0, 0, -1] };
  const attachmentFor = (p, prop) => prop === 'phone' && p && p.preset === 'phone' ? PHONE_AT_EAR : PROP_ATTACHMENTS[prop];
  function propFrame(p, prop, J = skeleton(p)) {
    const attachment = attachmentFor(p, prop); if (!attachment) return null;
    return { position: add(J.rWrist, mv(J.rHandM, mul(attachment.position, J.handSize))), matrix: chain(J.rHandM, attachRotation(attachment)), scale: J.handSize };
  }
  function matchHand(p, side, target) {
    const A = p[side + 'Arm'], sign = side === 'l' ? 1 : -1;
    const base = chain(skeleton(p)[side + 'ForeM'], ry(sign * A.e));
    let best = null, score = Infinity;
    for (const e of [...new Set([A.e, -90, -60, -30, 0, 30, 60, 90])]) {
      const F = chain(base, ry(-sign * e)), local = chain([F[0], F[3], F[6], F[1], F[4], F[7], F[2], F[5], F[8]], target);
      const pitch = clamp(Math.atan2(local[7], local[4]) / D2R, -70, 80), yaw = clamp(Math.asin(clamp(-local[1], -1, 1)) / D2R / sign, -30, 30), roll = clamp(-Math.atan2(local[2], local[0]) / D2R / sign, -60, 60);
      const actual = chain(F, rx(pitch), rz(sign * yaw), ry(-sign * roll));
      const error = actual.reduce((sum, value, i) => sum + (value - target[i]) ** 2, 0) * 1000 + (pitch * pitch + yaw * yaw + roll * roll + e * e * 0.1) * 0.00001;
      if (error < score) { score = error; best = { e, wristPitch: pitch, wristYaw: yaw, wristRoll: roll }; }
    }
    Object.assign(A, best);
  }
  // How people hold each prop when the arm was simply resting: where the prop sits in front of the
  // body (upper-body frame from the chest, metres at scale 1, right hand on -x) and which way it faces.
  // Phone and book are tipped toward the eyes (screen / cover facing the face); cup and umbrella upright.
  const HOLDS = {
    phone: { at: [-0.07, -0.12, 0.31], facing: [1, 0, 0, 0, 0.7071, -0.7071, 0, 0.7071, 0.7071] },
    book: { at: [-0.04, -0.2, 0.33], facing: [1, 0, 0, 0, 0.7071, -0.7071, 0, 0.7071, 0.7071], spins: [0, -30, 30, -60, 60, -90, 90] },
    cup: { at: [-0.15, -0.21, 0.27], up: true },
    umbrella: { at: [-0.19, -0.27, 0.22], up: true }
  };
  function naturalHold(p, prop, override = null) {
    const H = override ? { ...HOLDS[prop], ...override } : HOLDS[prop]; if (!H) return;
    const A = p.rArm, J0 = skeleton(p), R = attachRotation(PROP_ATTACHMENTS[prop]);
    const Rt = [R[0], R[3], R[6], R[1], R[4], R[7], R[2], R[5], R[8]];
    const upWorld = mv(J0.ubM, [0, 1, 0]), B0 = measurements(p.body), reachScale = (B0.upper + B0.fore) / 0.57;
    let want = null, handTarget = null;
    // Where it sits scales with arm length, so a child does not hold things at a straight arm.
    const at = [H.at[0], H.at[1], H.at[2] * reachScale];
    let goal = add(J0.chest, mv(J0.ubM, mul(at, J0.scale)));
    const orient = () => {
      if (handTarget) { matchHand(p, 'r', handTarget); return; }
      // Upright props: try a few wrist turns and keep the one that stands the prop up best.
      let best = null, err = Infinity;
      for (const turn of [-90, -45, 0, 45, 90, 180]) {
        const h = chain(J0.ubM, ry(turn), Rt); matchHand(p, 'r', h);
        const F = propFrame(p, prop), e = 1 - dot([F.matrix[1], F.matrix[4], F.matrix[7]], upWorld);
        if (e < err) { err = e; best = { ...A }; }
      }
      Object.assign(A, best);
    };
    const score = q => {
      Object.assign(A, q); orient();
      const F = propFrame(p, prop), miss = Math.hypot(...sub(F.position, goal)) / J0.scale;
      const facing = want ? F.matrix.reduce((sum, v, i) => sum + (v - want[i]) ** 2, 0) : 1 - dot([F.matrix[1], F.matrix[4], F.matrix[7]], upWorld);
      return miss * 1000 + facing * 40 + Math.abs(q.a - 12) * 0.03 + Math.abs(q.d) * 0.01;
    };
    let best = null, cost = Infinity, bestSpin = 0;
    // A book may turn a little in its own plane if that lets the wrist hold it more naturally.
    for (const spin of H.spins || [0]) {
      if (H.facing) { want = chain(J0.ubM, H.facing, rz(spin)); handTarget = chain(want, Rt); }
      for (const a of [0, 15, 30]) for (const b of [20, 40, 60, 80]) for (const c of [70, 90, 110, 130]) for (const d of [-20, 0, 20, 40]) {
        const q = { a, b, c, d }, v = score(q) + Math.abs(spin) * 0.15; if (v < cost) { cost = v; best = q; bestSpin = spin; }
      }
    }
    if (H.facing) { want = chain(J0.ubM, H.facing, rz(bestSpin)); handTarget = chain(want, Rt); }
    const refine = () => {
      cost = score(best);
      for (const step of [6, 3, 1]) for (let pass = 0; pass < 3; pass++) for (const k of ['a', 'b', 'c', 'd']) for (const dir of [-1, 1]) {
        const q = { ...best, [k]: clamp(best[k] + dir * step, k === 'c' ? 0 : -35, k === 'c' ? 150 : 180) }, v = score(q); if (v < cost) { cost = v; best = q; }
      }
      score(best);
    };
    // Move the prop forward a little at a time until neither hand nor prop touches the body.
    for (let i = 0; i < 8; i++) { refine(); if (armPenetration(p, 'r') === 0) break; goal = add(goal, mul(mv(J0.ubM, [0, 0, 1]), 0.015 * J0.scale)); }
  }
  function holdProp(pose, prop) {
    const p = normalizePose(pose), grip = GRIPS[prop];
    if (!grip) return p;
    p.props = [...p.props.filter(k => !PROPS[k].hand), prop];
    const A = p.rArm;
    const resting = A.a < 25 && A.b < 15 && A.c < 30;
    if (resting) Object.assign(A, { a: 10, b: 35, c: 95, d: 0, e: 0 });
    // Keep the arm's action, and solve a comfortable wrist orientation for this prop.
    const J = skeleton(p);
    const up = mv(attachRotation(PROP_ATTACHMENTS[prop]), [0, 1, 0]);
    const foreBase = chain(J.rForeM, ry(-A.e));
    const score = q => {
      const R = chain(foreBase, ry(q[3]), rx(q[0]), rz(-q[1]), ry(q[2]));
      const alignment = dot(mv(R, up), [0, 1, 0]);
      const error = prop === 'book' ? 1 - Math.abs(alignment) : 1 - alignment;
      return error * 20 + (q[0] ** 2 + q[1] ** 2 * 1.5 + q[2] ** 2 * 0.8 + q[3] ** 2 * 0.15) * 0.00001;
    };
    let best = [0, 0, 0, 0], cost = score(best);
    for (let pitch = -70; pitch <= 80; pitch += 15) for (let yaw = -30; yaw <= 30; yaw += 15) for (let roll = -60; roll <= 60; roll += 30) for (let fore = -90; fore <= 90; fore += 30) {
      const q = [pitch, yaw, roll, fore], c = score(q); if (c < cost) { best = q; cost = c; }
    }
    for (const step of [5, 1]) {
      const seed = [...best];
      for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (let c = -1; c <= 1; c++) for (let d = -1; d <= 1; d++) {
        const q = [clamp(seed[0] + a * step, -70, 80), clamp(seed[1] + b * step, -30, 30), clamp(seed[2] + c * step, -60, 60), clamp(seed[3] + d * step, -90, 90)], value = score(q);
        if (value < cost) { best = q; cost = value; }
      }
    }
    [A.wristPitch, A.wristYaw, A.wristRoll, A.e] = best; A.spread = 2;
    p.gripVersion = 1;
    ['thumb', 'index', 'middle', 'ring', 'pinky'].forEach((name, i) => { A[name] = grip.curls[i]; });
    if (prop === 'phone' && p.preset === 'lookphone') {
      // Looking at the phone: held higher in front of the chest, screen turned up toward the eyes.
      naturalHold(p, 'phone', { at: [-0.05, -0.04, 0.3], facing: [1, 0, 0, 0, 0.5, -0.866, 0, 0.866, 0.5], spins: [0, -30, 30, 90, -90] });
    } else if (resting && !(prop === 'phone' && p.preset === 'phone')) naturalHold(p, prop);
    if (prop === 'phone' && p.preset === 'phone') {
      const head = skeleton(p), desired = chain(head.headM, ry(-90)), hand = chain(desired, rx(180));
      const centre = add(head.head, mv(head.headM, [-0.13 * head.headSize, -0.045 * head.headSize, 0.01 * head.headSize]));
      const grip = { ...A }; let best = null, bestScore = Infinity;
      for (const d of [-60, -30, 0, 30, 60, 80]) {
        Object.assign(A, grip, { a: 15, b: 25, c: 110, d });
        for (let i = 0; i < 3; i++) {
          matchHand(p, 'r', hand);
          const J = skeleton(p), offset = sub(propFrame(p, 'phone', J).position, J.rWrist);
          const solved = reach(p, 'r', 'Arm', 'rWrist', sub(centre, offset)); Object.assign(A, solved.rArm);
        }
        matchHand(p, 'r', hand);
        const frame = propFrame(p, 'phone'), penetration = armPenetration(p, 'r');
        const alignment = frame.matrix.reduce((sum, n, i) => sum + (n - desired[i]) ** 2, 0);
        const error = Math.hypot(...sub(frame.position, centre)) / head.headSize;
        const score = (penetration > 0 ? 1e9 + penetration * 1e7 : 0) + error * 1e6 + alignment * 1000 + A.a * A.a + A.b * A.b * 0.1;
        if (score < bestScore) { bestScore = score; best = { ...A }; }
      }
      Object.assign(A, best);
    }
    return p;
  }
  const modelDistance = (a, b) => Math.hypot((b.x || 0) - (a.x || 0), (b.z || 0) - (a.z || 0));
  function setSeated(pose, seated) {
    const p = normalizePose(pose), preset = PRESETS.find(x => x.id === (seated ? 'sit' : 'stand')).pose;
    p.seated = seated;
    p.lLeg = { ...preset.lLeg }; p.rLeg = { ...preset.rLeg };
    p.preset = null;
    return p;
  }
  function spaceModels(a, b, requested) {
    const A = normalizePose(a), B = normalizePose(b), distance = clamp(finite(requested, modelDistance(A, B)), 0.2, 4);
    const old = modelDistance(A, B), direction = old > 1e-6 ? [(B.x - A.x) / old, (B.z - A.z) / old] : [1, 0];
    for (const [i, axis] of ['x', 'z'].entries()) {
      const half = direction[i] * distance / 2, center = clamp((A[axis] + B[axis]) / 2, -3 + Math.abs(half), 3 - Math.abs(half));
      A[axis] = center - half; B[axis] = center + half;
    }
    return [A, B];
  }

  /* ---------- physical camera: metres, one pose shared by the icon and preview ---------- */
  const CAMERA = { minDistance: 0.2, maxDistance: 15, fov: 45, guideRadius: 1.1, floor: 0.06 };
  // Lens focal length (full-frame equivalent). 0 = auto: the studio's own 45° view, no lens words.
  const LENSES = [24, 35, 50, 85, 135];
  const LENS_WORDS = { 24: ['24mm广角镜头', '24mm wide-angle lens'], 35: ['35mm镜头', '35mm lens'], 50: ['50mm标准镜头', '50mm lens'], 85: ['85mm人像镜头', '85mm portrait lens'], 135: ['135mm长焦镜头', '135mm telephoto lens'] };
  const camFov = cam => cam && cam.lens ? 2 * Math.atan(12 / cam.lens) / D2R : CAMERA.fov;
  const camDir = c => norm(v(-Math.sin(c.az * D2R) * Math.cos(c.el * D2R), Math.sin(c.el * D2R), Math.cos(c.az * D2R) * Math.cos(c.el * D2R)));
  function cameraTarget(cam, J) {
    if (cam.focus === 'head') return add(J.head, mv(J.headM, mul([0, -0.01, 0.09], J.headSize || 1)));
    return add(J.chest, mv(J.ubM, mul([0, cam.focus === 'whole' ? -0.16 : -0.08, 0.1], J.scale || 1)));
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
    return { target, pos: add(target, mul(camDir(camera), camera.distance)), fov: camFov(normalizeCamera(cam)), camera };
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
    const target = cameraTarget(normalizeCamera(cam), J), vf = Math.tan(camFov(normalizeCamera(cam)) * D2R / 2), hf = vf * aspect;
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
    const top = add(J.head, mv(J.headM, mul([0, 0.125, 0], J.headSize || 1))), chin = add(J.head, mv(J.headM, mul([0, -0.11, 0.04], J.headSize || 1)));
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
  function describeCamera(cam, lang, yaw = 0, J = skeleton(BASE()), aspect = 1, J2 = null) {
    const c = constrainCamera(cam, J), i = lang === 'zh' ? 0 : 1, rel = c.az - yaw;
    const az = AZ[Math.round((((rel % 360) + 360) % 360) / 45) % 8][i];
    const words = [az, elWords(c.el)[i], shotWords(c, J, aspect)[i]];
    if (J2) { const two = pairWords(c, J, J2, aspect); if (two) words.push(two[i]); }
    const lens = normalizeCamera(cam).lens; if (lens) words.push(LENS_WORDS[lens][i]);
    return words.join(lang === 'zh' ? ',' : ', ');
  }
  // With a second person: a two-shot, or an over-the-shoulder shot when they are much closer to the lens.
  function pairWords(cam, J, J2, aspect) {
    const spec = shotCamera(cam, J), W = 100 * aspect, view = makeView(spec.pos, spec.target, spec.fov, W, 100);
    const q = view.project(J2.head) || view.project(J2.chest);
    const near = p => !!p && p.x > -15 && p.x < W + 15 && p.y > -25 && p.y < 125;
    if (!near(q) && !near(view.project(J2.chest))) return null;
    const dA = Math.hypot(...sub(J.head, spec.pos)), dB = Math.hypot(...sub(J2.head, spec.pos));
    if (dB < dA * 0.55) return ["过肩镜头,从另一个人的肩后拍", "over-the-shoulder shot from behind the other person"];
    return ["双人镜头,两个人都在画面里", "two-shot, both people in frame"];
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
    // A held prop changes what the hands do, so presets that describe both hands step aside.
    const holding = (p.props || []).some(k => PROPS[k] && PROPS[k].hand);
    const preset = p.preset && !(holding && ["stand", "sit", "hips", "cross", "lookphone", "cheer"].includes(p.preset)) && PRESETS.find(x => x.id === p.preset);
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
        if (Math.abs(A.e - REST_FOREARM) > 30) parts.push(zh ? `${side}前臂旋转` : `${side}forearm rotated`);
        if (Math.abs(A.wristPitch) > 20 || Math.abs(A.wristYaw) > 15 || Math.abs(A.wristRoll) > 20) parts.push(zh ? `${side}手腕弯曲转动` : `${side}wrist bent or rotated`);
        const curls = [A.index, A.middle, A.ring, A.pinky];
        if (!(s === 'r' && holding)) {
          if (curls.every(n => n > 65)) parts.push(zh ? `${side}手握拳` : `${side}hand in a fist`);
          else if (A.index < 15 && curls.slice(1).every(n => n > 65)) parts.push(zh ? `${side}食指伸直，其余手指弯曲` : `${side}index finger extended, other fingers curled`);
          else if (curls.every(n => n < 15) && A.spread > 12) parts.push(zh ? `${side}手张开五指` : `${side}hand open with fingers spread`);
        }
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
    const bodySay = (BODY_TYPES[p.body] || {}).say;
    if (bodySay) parts.unshift(bodySay[i]);
    for (const k of p.props || []) {
      const prop = PROPS[k];
      if (k === "chair" && p.seated) continue;
      parts.push(prop.say[i]);
    }
    let text = parts.join(zh ? "," : ", ");
    if ((p.props || []).includes("chair") && p.seated) text = text.replace(/凳子/g, "椅子").replace(/stool/g, "chair").replace(/^(身材\S+?,|小孩,)?坐着/, "$1坐在椅子上").replace(/(^|, )sitting(?! on)/, "$1sitting on a chair");
    return text;
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
      seated: "Sitting (adds a stool)", presets: "Common poses", camPresets: "Angles", output: "Prompt" }
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
    p.body = BODY_TYPES[raw.body] ? raw.body : "male";
    p.x = clamp(finite(raw.x, 0), -3, 3); p.z = clamp(finite(raw.z, 0), -3, 3);
    p.props = Array.isArray(raw.props) ? [...new Set(raw.props.filter(k => PROPS[k]))] : [];
    p.gripVersion = raw.gripVersion === 1 ? 1 : 0;
    return p;
  }
  function migratePose(raw) {
    const p = normalizePose(raw), held = p.props.find(k => PROPS[k].hand);
    return held && !p.gripVersion ? holdProp(p, held) : p;
  }


  /* ---------- the arm cannot pass through the body ---------- */
  // Torso cross-sections measured from the anatomical mesh in its bind pose (tools: per body type,
  // in units of J.scale): [height above the pelvis, centre front/back, then the surface distance from
  // that centre in 16 directions, in millimetres, starting straight ahead and turning toward +x].
  const TORSO = {"male":[[-0.08,0.016,114,130,123,117,111,133,140,131,108,131,140,133,126,120,123,130],[-0.04,0.022,120,131,152,163,155,151,150,136,116,136,150,151,155,163,152,131],[0,0.026,120,130,154,160,158,146,145,134,119,134,145,146,158,160,154,130],[0.04,0.038,112,121,143,152,153,149,140,128,110,128,140,149,153,152,143,121],[0.08,0.045,105,115,136,146,148,148,136,121,103,121,136,148,148,146,136,115],[0.12,0.043,103,111,132,145,146,143,131,116,100,116,131,143,146,145,132,111],[0.16,0.037,106,123,143,147,144,144,141,119,106,119,141,144,144,147,143,123],[0.2,0.035,109,127,149,151,150,152,149,127,108,127,149,152,150,151,149,127],[0.24,0.03,114,133,153,157,159,161,154,132,107,132,154,161,159,157,153,133],[0.28,0.029,114,139,163,165,166,168,164,137,108,137,164,168,166,165,163,139],[0.32,0.026,114,146,171,172,168,174,174,139,106,139,174,174,168,172,171,146],[0.36,0.022,109,143,172,175,169,185,174,141,102,141,174,185,169,175,172,143],[0.4,0.012,110,125,169,172,182,192,171,124,88,124,171,192,182,172,169,125],[0.44,0.003,99,109,156,171,184,193,161,95,71,95,161,193,184,171,156,109]],"female":[[-0.08,-0.006,106,127,121,115,109,104,122,128,103,128,122,116,110,104,121,127],[-0.04,-0.003,121,131,155,147,162,170,159,139,111,139,159,170,162,154,155,131],[0,0.004,124,136,164,177,180,174,160,141,116,141,160,174,180,177,164,136],[0.04,0.018,120,128,148,168,175,169,157,139,118,139,157,169,175,168,148,128],[0.08,0.032,111,118,134,158,167,166,150,127,106,127,150,166,167,158,134,118],[0.12,0.041,99,109,120,138,157,158,141,111,97,111,141,158,157,138,120,109],[0.16,0.048,93,100,112,129,143,147,137,108,92,108,137,147,143,129,112,100],[0.2,0.048,94,106,120,130,134,132,126,111,90,111,126,132,134,130,120,106],[0.24,0.046,97,109,121,134,138,138,132,113,94,113,132,138,138,134,121,109],[0.28,0.039,103,119,156,156,148,149,145,125,98,125,145,149,148,156,156,119],[0.32,0.038,100,135,167,163,155,165,160,139,112,139,160,165,155,163,167,135],[0.36,0.026,103,140,164,159,157,188,164,139,109,139,164,188,157,159,164,140],[0.4,0.012,105,125,152,156,191,201,163,125,91,125,163,201,191,156,152,125],[0.44,0.001,95,104,139,154,185,195,150,107,78,107,150,195,185,154,139,104]],"slim":[[-0.08,0.022,91,101,96,91,87,110,116,102,87,102,116,110,105,100,96,101],[-0.04,0.026,95,103,134,127,131,138,123,110,93,110,123,138,131,127,134,103],[0,0.027,94,105,145,156,152,139,120,107,89,107,120,139,152,156,145,105],[0.04,0.035,88,98,140,152,151,140,123,102,87,102,123,140,151,152,140,98],[0.08,0.04,83,91,127,140,139,136,118,95,83,95,118,136,139,140,127,91],[0.12,0.039,82,91,110,120,119,117,110,94,82,94,110,117,119,120,110,91],[0.16,0.037,86,105,129,135,129,123,123,106,88,106,123,123,129,135,129,105],[0.2,0.038,100,112,141,144,140,132,132,117,97,117,132,132,140,144,141,112],[0.24,0.036,107,120,146,149,145,141,141,125,102,125,141,141,145,149,146,120],[0.28,0.034,109,126,152,154,152,149,147,127,107,127,147,149,152,154,152,126],[0.32,0.03,109,131,156,157,157,148,149,130,109,130,149,148,157,157,156,131],[0.36,0.025,108,130,154,157,154,158,151,129,104,129,151,158,154,157,154,130],[0.4,0.018,103,120,148,157,171,180,148,118,90,118,148,180,171,157,148,120],[0.44,0.01,92,103,140,156,176,186,141,109,75,109,141,186,176,156,140,103]],"strong":[[-0.08,0.016,99,113,107,102,97,123,129,119,81,119,129,123,117,111,107,113],[-0.04,0.024,110,121,149,168,160,150,147,129,100,129,147,150,160,168,149,121],[0,0.031,113,122,151,166,164,155,151,129,100,129,151,155,164,166,151,122],[0.04,0.039,110,118,145,158,162,158,148,129,99,129,148,158,162,158,145,118],[0.08,0.047,101,112,134,150,156,156,142,118,99,118,142,156,156,150,134,112],[0.12,0.041,103,109,129,149,150,146,134,115,97,115,134,146,150,149,129,109],[0.16,0.03,104,113,126,140,139,135,132,119,98,119,132,135,139,140,126,113],[0.2,0.027,109,118,128,139,141,142,140,127,102,127,140,142,141,139,128,118],[0.24,0.024,114,123,133,144,152,152,149,131,105,131,149,152,152,144,133,123],[0.28,0.023,115,137,154,161,172,170,158,136,104,136,158,170,172,161,154,137],[0.32,0.024,117,142,165,173,177,178,165,141,110,141,165,178,177,173,165,142],[0.36,0.02,117,141,170,183,177,201,172,143,107,143,172,201,177,183,170,141],[0.4,0.015,116,133,163,176,201,211,173,140,96,140,173,211,201,176,163,133],[0.44,0.008,105,114,141,170,196,206,164,122,80,122,164,206,196,170,141,114]],"child":[[-0.08,-0.002,96,110,104,99,94,89,107,113,91,113,107,102,97,92,104,110],[-0.04,0.004,103,113,131,141,140,133,131,119,99,119,131,133,140,141,131,113],[0,0.012,101,109,127,139,140,136,132,115,98,115,132,136,140,139,127,109],[0.04,0.022,93,99,116,131,136,135,127,108,93,108,127,135,136,131,116,99],[0.08,0.028,87,93,106,124,130,130,116,96,87,96,116,130,130,124,106,93],[0.12,0.03,81,89,103,119,123,122,109,92,81,92,109,122,123,119,103,89],[0.16,0.029,83,90,105,114,116,116,109,96,81,96,109,116,116,114,105,90],[0.2,0.025,87,95,110,117,118,121,115,101,85,101,115,121,118,117,110,95],[0.24,0.017,93,107,117,121,122,124,122,109,89,109,122,124,122,121,117,107],[0.28,0.015,95,118,128,128,128,129,130,114,94,114,130,129,128,128,128,118],[0.32,0.012,95,121,132,132,131,133,135,121,95,121,135,133,131,132,132,121],[0.36,0.007,91,116,132,137,145,152,142,114,90,114,142,152,145,137,132,116],[0.4,-0.002,87,102,132,139,148,156,137,93,78,93,137,156,148,139,132,102],[0.44,-0.006,76,82,106,142,136,151,126,79,66,79,126,151,136,142,106,82]]};
  const tmv = (R, a) => [R[0] * a[0] + R[3] * a[1] + R[6] * a[2], R[1] * a[0] + R[4] * a[1] + R[7] * a[2], R[2] * a[0] + R[5] * a[1] + R[8] * a[2]];
  // How far (as a fraction of the local torso radius) a point of arm surface sinks into the torso.
  function torsoDepth(J, body, q, margin = 0.003) {
    const rows = collisionSurface?.variants[body]?.torso || TORSO[body] || TORSO.male;
    let l = mul(tmv(J.bodyM, sub(q, J.pelvis)), 1 / J.scale);
    if (l[1] > 0.2) l = add(mul(tmv(J.ubM, sub(q, J.waist)), 1 / J.scale), [0, 0.2, 0]);
    if (l[1] < rows[0][0] || l[1] > rows[rows.length - 1][0]) return 0;
    let k = 0; while (k < rows.length - 2 && rows[k + 1][0] < l[1]) k++;
    const f = clamp((l[1] - rows[k][0]) / (rows[k + 1][0] - rows[k][0]), 0, 1);
    const radius = row => {
      const count = row.length - 2, z = l[2] - row[1], d = Math.hypot(l[0], z), u = ((Math.atan2(l[0], z) / (2 * Math.PI)) * count + count) % count, i = Math.floor(u), w = u - i;
      return [d, (row[2 + i] * (1 - w) + row[2 + (i + 1) % count] * w) / 1000];
    };
    const [d0, r0] = radius(rows[k]), [d1, r1] = radius(rows[k + 1]), d = d0 + (d1 - d0) * f, R = r0 + (r1 - r0) * f;
    return Math.max(0, (R + margin / J.scale - d) / R);
  }
  // Thigh and shin surface radius along each bone (six steps from the upper joint), from the mesh.
  const LEGS = {"male":[[0.123,0.12,0.12,0.112,0.096,0.077],[0.092,0.094,0.09,0.078,0.063,0.054]],"female":[[0.114,0.118,0.118,0.115,0.102,0.083],[0.081,0.091,0.092,0.082,0.061,0.044]],"slim":[[0.107,0.105,0.106,0.101,0.089,0.069],[0.079,0.083,0.081,0.072,0.059,0.052]],"strong":[[0.121,0.125,0.125,0.119,0.101,0.078],[0.087,0.091,0.089,0.075,0.058,0.046]],"child":[[0.087,0.089,0.092,0.092,0.084,0.07],[0.069,0.077,0.076,0.065,0.054,0.042]]};
  function legDepth(J, body, q, margin = 0.003) {
    const [thigh, shin] = LEGS[body] || LEGS.male; let deepest = 0;
    for (const s of ["l", "r"]) for (const [A, C, prof] of [[J[s + "Hip"], J[s + "Knee"], thigh], [J[s + "Knee"], J[s + "Ankle"], shin]]) {
      const ax = sub(C, A), len2 = dot(ax, ax) || 1, t = clamp(dot(sub(q, A), ax) / len2, 0, 1);
      const d = Math.hypot(...sub(q, add(A, mul(ax, t)))), u = t * 5, i = Math.min(4, Math.floor(u)), R = (prof[i] + (prof[i + 1] - prof[i]) * (u - i)) * J.scale * 0.90;
      deepest = Math.max(deepest, (R + margin - d) / R);
    }
    return deepest;
  }
  const capsuleDepth = (q, a, b, radius, margin) => {
    const axis = sub(b, a), t = clamp(dot(sub(q, a), axis) / (dot(axis, axis) || 1), 0, 1);
    return Math.max(0, (radius + margin - Math.hypot(...sub(q, add(a, mul(axis, t))))) / radius);
  };
  function bodyDepth(p, J, q, radius) {
    const centre = add(J.head, mv(J.headM, mul([0, -0.04, 0.018], J.headSize)));
    const local = tmv(J.headM, sub(q, centre));
    const radii = [0.108, 0.142, 0.135].map(r => r * J.headSize + radius + 0.004 * J.scale);
    let head = Math.max(0, 1 - Math.hypot(...local.map((v, i) => v / radii[i])));
    if (collisionSurface) {
      const h = mul(tmv(J.headM, sub(q, J.head)), 1 / J.headSize), rows = collisionSurface.variants[p.body || 'male'].head;
      const u = (h[1] + 0.18) / 0.015, index = Math.floor(u), fraction = u - index;
      if (index < 0 || index >= rows.length - 1) head = 0;
      else {
        const az = ((Math.atan2(h[0], h[2] - 0.015) / (Math.PI * 2) * 32) + 32) % 32, a = Math.floor(az), mix = az - a;
        const r0 = rows[index][a] * (1 - mix) + rows[index][(a + 1) % 32] * mix, r1 = rows[index + 1][a] * (1 - mix) + rows[index + 1][(a + 1) % 32] * mix;
        const r = r0 * (1 - fraction) + r1 * fraction, distance = Math.hypot(h[0], h[2] - 0.015);
        head = r > 0 ? Math.max(0, (r + (radius + 0.004 * J.scale) / J.headSize - distance) / r) : 0;
      }
    }
    return Math.max(head, torsoDepth(J, p.body, q, radius + 0.004 * J.scale), legDepth(J, p.body, q, radius + 0.003 * J.scale), capsuleDepth(q, J.chest, J.neck, 0.047 * J.scale, radius));
  }
  let collisionSurface = null;
  const groundCache = new Map();
  function surfaceGroundLift(p, J, B) {
    const key = JSON.stringify([p.body, p.pelvisPitch, p.pelvisRoll, p.lLeg, p.rLeg]);
    if (groundCache.has(key)) return groundCache.get(key);
    const frames = {};
    for (const side of ['l', 'r']) {
      frames[side + 'Foot'] = { position: J[side + 'Ankle'], matrix: J[side + 'FootM'] };
      frames[side + 'Shin'] = { position: J[side + 'Knee'], matrix: J[side + 'ShinM'] };
      frames[side + 'Toes'] = { position: add(J[side + 'Ankle'], mv(J[side + 'FootM'], mul([0, -0.02, 0.10], B.footSize))), matrix: chain(J[side + 'FootM'], rx(-p[side + 'Leg'].toe)) };
    }
    let minimum = Infinity;
    for (const influences of collisionSurface.variants[p.body || 'male'].feet) {
      let y = 0;
      for (const { name, weight, local } of influences) { const f = frames[name], R = f.matrix; y += (f.position[1] + R[3] * local[0] + R[4] * local[1] + R[5] * local[2]) * weight; }
      minimum = Math.min(minimum, y);
    }
    const lift = -minimum + 0.005; if (groundCache.size > 1000) groundCache.clear(); groundCache.set(key, lift); return lift;
  }
  function setCollisionData(data) {
    if (collisionSurface?.data === data) return;
    groundCache.clear();
    const decode = (s, Type) => { const raw = atob(s), bytes = Uint8Array.from(raw, c => c.charCodeAt(0)); return new Type(bytes.buffer); };
    const ids = decode(data.skinIndex, Uint8Array), weights = decode(data.skinWeight, Uint8Array), variants = {};
    for (const [type, variant] of Object.entries(data.variants)) {
      const positions = decode(variant.position, Int16Array), bind = skinFrames(bindPose(type)), J = skeleton(bindPose(type));
      const sides = { l: [], r: [], feet: [] }, cells = { l: new Set(), r: new Set() }, headPoints = [], torsoPoints = [];
      for (let i = 0; i < data.vertices; i++) {
        const point = [positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2]].map(x => x / 10000);
        let headWeight = 0, torsoWeight = 0, footWeight = 0;
        for (let c = 0; c < 4; c++) { const name = data.bones[ids[i * 4 + c]], weight = weights[i * 4 + c] / 255; if (name === 'head') headWeight += weight; if (name === 'torso' || name === 'pelvis' || name === 'neck' || name.endsWith('Clavicle')) torsoWeight += weight; if (/^[lr](Foot|Toes)$/.test(name)) footWeight += weight; }
        if (headWeight > 0.7) headPoints.push(mul(tmv(J.headM, sub(point, J.head)), 1 / J.headSize));
        if (torsoWeight > 0.65) torsoPoints.push(mul(tmv(J.bodyM, sub(point, J.pelvis)), 1 / J.scale));
        if (footWeight > 0.7) {
          const influences = [];
          for (let c = 0; c < 4; c++) { const weight = weights[i * 4 + c] / 255; if (!weight) continue; const name = data.bones[ids[i * 4 + c]], frame = bind[name]; influences.push({ name, weight, local: mul(tmv(frame.matrix, sub(point, frame.position)), 1 / J.scale) }); }
          sides.feet.push(influences);
        }
        for (const side of ['l', 'r']) {
          let arm = 0, upper = 0;
          for (let c = 0; c < 4; c++) { const name = data.bones[ids[i * 4 + c]], w = weights[i * 4 + c] / 255; if (name.startsWith(side) && /^(Upper|Fore|Hand|thumb|index|middle|ring|pinky)/.test(name.slice(1))) arm += w; if (name === side + 'Upper') upper += w; }
          if (arm < 0.7) continue;
          if (upper > 0.25) { const axis = sub(J[side + 'Elbow'], J[side + 'Shoulder']), t = dot(sub(point, J[side + 'Shoulder']), axis) / dot(axis, axis); if (t < 0.34) continue; }
          const key = point.map(x => Math.floor(x / (0.028 * J.scale))).join(':'); if (cells[side].has(key)) continue; cells[side].add(key);
          const influences = [];
          for (let c = 0; c < 4; c++) {
            const weight = weights[i * 4 + c] / 255; if (!weight) continue;
            const name = data.bones[ids[i * 4 + c]], B = bind[name]; influences.push({ name, weight, local: tmv(B.matrix, sub(point, B.position)) });
          }
          sides[side].push(influences);
        }
      }
      sides.head = Array.from({ length: 21 }, (_, row) => {
        const y = -0.18 + row * 0.015, radii = new Array(32).fill(0);
        for (const q of headPoints) {
          if (Math.abs(q[1] - y) > 0.014) continue;
          const az = ((Math.atan2(q[0], q[2] - 0.015) / (Math.PI * 2) * 32) + 32) % 32, index = Math.floor(az), radius = Math.hypot(q[0], q[2] - 0.015) + 0.002;
          radii[index] = Math.max(radii[index], radius); radii[(index + 1) % 32] = Math.max(radii[(index + 1) % 32], radius);
        }
        if (radii.some(r => r > 0)) for (let a = 0; a < 32; a++) if (!radii[a]) for (let step = 1; step < 32; step++) { const r = Math.max(radii[(a + step) % 32], radii[(a - step + 32) % 32]); if (r) { radii[a] = r; break; } }
        return radii;
      });
      sides.torso = Array.from({ length: 40 }, (_, row) => {
        const y = -0.12 + row * 0.02, radii = new Array(32).fill(0);
        for (const q of torsoPoints) {
          if (Math.abs(q[1] - y) > 0.015) continue;
          const az = ((Math.atan2(q[0], q[2]) / (Math.PI * 2) * 32) + 32) % 32, a = Math.floor(az), radius = (Math.hypot(q[0], q[2]) + 0.001) * 1000;
          radii[a] = Math.max(radii[a], radius); radii[(a + 1) % 32] = Math.max(radii[(a + 1) % 32], radius);
        }
        if (!radii.some(r => r > 0)) return null;
        for (let a = 0; a < 32; a++) if (!radii[a]) for (let step = 1; step < 32; step++) { const r = Math.max(radii[(a + step) % 32], radii[(a - step + 32) % 32]); if (r) { radii[a] = r; break; } }
        return [y, 0, ...radii];
      }).filter(Boolean);
      variants[type] = sides;
    }
    collisionSurface = { data, variants };
  }
  function armSurface(p, side, J) {
    if (collisionSurface) {
      const frames = skinFrames(p, J), points = [];
      for (const influences of collisionSurface.variants[p.body || 'male'][side]) {
        const position = [0, 0, 0];
        for (const { name, weight, local } of influences) { const frame = frames[name], q = add(frame.position, mv(frame.matrix, local)); for (let a = 0; a < 3; a++) position[a] += q[a] * weight; }
        points.push({ position, radius: 0.006 * J.scale });
      }
      return points;
    }
    const points = [], sh = J[side + 'Shoulder'], el = J[side + 'Elbow'], wr = J[side + 'Wrist'];
    const bulk = { male: 1, female: 0.91, slim: 0.82, strong: 1.04, child: 0.76 }[p.body] || 1;
    const sphere = (position, radius) => points.push({ position, radius });
    for (const t of [0.36, 0.48, 0.62, 0.76, 0.88, 1]) sphere(add(sh, mul(sub(el, sh), t)), (0.075 - t * 0.03) * bulk * J.scale);
    for (let i = 0; i <= 6; i++) sphere(add(el, mul(sub(wr, el), i / 6)), [0.041, 0.052, 0.05, 0.046, 0.04, 0.034, 0.03][i] * bulk * J.scale);
    for (const y of [-0.025, -0.065, -0.105]) for (const x of [-0.037, 0, 0.037]) for (const z of [-0.021, 0.021]) sphere(add(wr, mv(J[side + 'HandM'], mul([x, y, z], J.handSize))), 0.004 * J.handSize);
    const fingers = handRig(p, side, J);
    for (const name of Object.keys(FINGERS)) for (let i = 0; i < 3; i++) {
      const f = fingers[side + name + i]; sphere(f.position, 0.008 * J.handSize);
      if (i === 2) sphere(fingers[side + name + 'Tip'], 0.007 * J.handSize);
    }
    return points;
  }
  function propSurface(p, prop, J) {
    const frame = propFrame(p, prop, J), points = [];
    const put = v => points.push({ position: add(frame.position, mv(frame.matrix, mul(v, frame.scale))), radius: 0.003 * frame.scale });
    if (prop === 'phone' || prop === 'book') {
      const [w, h, d] = prop === 'phone' ? [0.071, 0.147, 0.009] : [0.16, 0.222, 0.026];
      for (let x = 0; x <= 8; x++) for (let y = 0; y <= 12; y++) for (const z of [-d / 2, d / 2]) put([w * (x / 8 - 0.5), h * (y / 12 - 0.5), z]);
    } else if (prop === 'cup') {
      for (const y of [-0.05, 0, 0.05]) for (let i = 0; i < 12; i++) put([Math.cos(i * Math.PI / 6) * 0.039, y, Math.sin(i * Math.PI / 6) * 0.039]);
      for (const y of [-0.025, 0, 0.025]) put([-0.078, y, 0]);
    } else {
      for (let y = -0.045; y < 0.92; y += 0.08) put([0, y, 0]);
      for (const t of [0, 0.5, 1]) for (let i = 0; i < 16; i++) put([Math.cos(i * Math.PI / 8) * 0.55 * t, 1.065 - 0.23 * t, Math.sin(i * Math.PI / 8) * 0.55 * t]);
    }
    return points;
  }
  function armPenetration(p, side, J = skeleton(p)) {
    const points = armSurface(p, side, J);
    const held = side === "r" && (p.props || []).find(k => PROPS[k] && PROPS[k].hand);
    if (held) {
      points.push(...propSurface(p, held, J));
    }
    let deepest = 0;
    const other = side === 'l' ? 'r' : 'l';
    for (const { position: q, radius } of points) {
      deepest = Math.max(deepest, bodyDepth(p, J, q, radius));
      for (const [a, b, r] of [['Shoulder', 'Elbow', 0.05], ['Elbow', 'Wrist', 0.042]]) deepest = Math.max(deepest, capsuleDepth(q, J[other + a], J[other + b], r * J.scale, radius - 0.004 * J.scale));
    }
    return deepest > 0.00001 ? deepest : 0;
  }
  // "On the phone": the phone rests against the right ear with the fingers pointing up and the palm toward
  // the cheek, the elbow down and in front, instead of the hand reaching across the face.
  const PHONE_EAR = globalThis.PHONE_EAR || { phone: [-0.088, 0.005, 0.025], tilt: 35, yaw: -15, upright: 8 };
  const phoneCache = new Map();
  function phoneToEar(p) {
    // Solved once per figure / position / body; every redraw afterwards reuses it.
    const key = JSON.stringify({ ...p, rArm: null, lArm: null, preset: null });
    if (phoneCache.has(key)) { Object.assign(p.rArm, phoneCache.get(key)); return; }
    const A = p.rArm;
    // Fingers lie flatter along the back of the phone than in a hand-held grip, so they do not poke the cheek.
    Object.assign(A, PHONE_EAR.fingers || { thumb: 15, index: 6, middle: 8, ring: 10, pinky: 12 });
    const J0 = skeleton(p), side = mv(J0.headM, [-1, 0, 0]);
    // The phone's own orientation at the ear (screen to the cheek, running from ear toward the mouth);
    // the hand orientation follows from how the phone sits in the hand.
    // Hand frame columns: x = (0,0,1), y = (0,-1,0) fingers up, z = (1,0,0) palm (and screen) toward the head.
    const target = () => chain(skeleton(p).headM, ry(PHONE_EAR.yaw ?? -15), rx(-PHONE_EAR.tilt), [0, 0, 1, 0, -1, 0, 1, 0, 0]);
    const at = () => { const J = skeleton(p); return add(J.rWrist, mv(J.rHandM, mul(PHONE_AT_EAR.position, J.handSize))); };
    let goal = add(J0.head, mv(J0.headM, mul(PHONE_EAR.phone, J0.headSize)));
    const score = q => {
      Object.assign(A, q); matchHand(p, 'r', target());
      const J = skeleton(p), fore = norm(sub(J.rWrist, J.rElbow)), up = dot(fore, mv(J.headM, [0, 1, 0]));
      return Math.hypot(...sub(at(), goal)) * 1000 + Math.abs(q.a - 15) * 0.02 + Math.max(0, 8 - q.a) * 0.5 + Math.abs(q.d) * 0.01 + (1 - up) * PHONE_EAR.upright;
    };
    let best = null, cost = Infinity;
    for (const a of [0, 15, 30, 45]) for (const b of [70, 85, 100, 115]) for (const c of [130, 140, 150]) for (const d of [-15, 0, 15, 30]) {
      const q = { a, b, c, d }, v = score(q); if (v < cost) { cost = v; best = q; }
    }
    const refine = () => {
      cost = score(best);
      for (const step of [5, 2, 1]) for (let pass = 0; pass < 4; pass++) for (const k of ['a', 'b', 'c', 'd']) for (const dir of [-1, 1]) {
        const q = { ...best, [k]: clamp(best[k] + dir * step, k === 'c' ? 0 : -35, k === 'c' ? 150 : 180) }, v = score(q); if (v < cost) { cost = v; best = q; }
      }
      score(best);
    };
    // Bring the phone as close to the cheek as the body allows: step outward until nothing intersects.
    for (let i = 0; i < 12; i++) { refine(); if (armPenetration(p, 'r') === 0) break; goal = add(goal, mul(side, 0.004 * J0.headSize)); }
    if (phoneCache.size > 40) phoneCache.clear();
    phoneCache.set(key, { ...A });
  }
  // Move an arm (or the prop in its hand) that would cut through the torso or legs the least way out:
  // raise it out to the side or forward, and bend or straighten the elbow if that is not enough.
  function resolveArms(p, { previous = null } = {}) {
    const held = p.props.some(k => PROPS[k].hand);
    if (p.preset === 'hips') {
      for (const [side, sign] of [['l', 1], ['r', -1]]) {
        if (side === 'r' && held) continue;
        const J = skeleton(p), goal = add(J.pelvis, mv(J.bodyM, mul([sign * (measurements(p.body).hip + 0.135), 0.065, 0.015], J.scale)));
        const solved = reach(p, side, 'Arm', side + 'Wrist', goal); Object.assign(p[side + 'Arm'], solved[side + 'Arm']);
        matchHand(p, side, chain(J.bodyM, ry(-sign * 90)));
      }
    }
    if (p.preset === 'phone') phoneToEar(p);
    const sameFrame = previous && Object.keys(p).every(key => ['lArm', 'rArm', 'preset', 'gripVersion'].includes(key) || JSON.stringify(p[key]) === JSON.stringify(previous[key]));
    for (const side of ["l", "r", "l", "r"]) {
      if (armPenetration(p, side) <= 0) continue;
      const A = p[side + 'Arm'], original = { ...A }, held = side === 'r' && p.props.some(k => PROPS[k].hand);
      if (sameFrame && Object.keys(original).every(key => Math.abs(original[key] - previous[side + 'Arm'][key]) <= 25)) {
        const old = previous[side + 'Arm']; Object.assign(A, old);
        if (armPenetration(p, side) === 0) {
          let low = 0, high = 1;
          for (let i = 0; i < 8; i++) { const t = (low + high) / 2; for (const key of Object.keys(original)) A[key] = old[key] + (original[key] - old[key]) * t; if (armPenetration(p, side) === 0) low = t; else high = t; }
          for (const key of Object.keys(original)) A[key] = old[key] + (original[key] - old[key]) * low;
          continue;
        }
        Object.assign(A, original);
      }
      const reference = skeleton(p)[side + 'HandM'];
      const limits = { a: [-35, 180], b: [-60, 180], c: [0, 150], d: [-90, 90] };
      function evaluate(values) {
        Object.assign(A, original, values);
        if (held) matchHand(p, side, reference);
        const penetration = armPenetration(p, side);
        const deviation = ['a', 'b', 'c', 'd'].reduce((sum, k) => sum + (A[k] - original[k]) ** 2 * (k === 'd' ? 0.35 : 1), 0);
        return { pose: { ...A }, penetration, score: penetration > 0 ? 1e9 + penetration * 1e7 + deviation : deviation };
      }
      let best = evaluate(original);
      for (const seed of [{}, { a: clamp(original.a + 35, -35, 180) }, { b: clamp(original.b + 45, -60, 180) }, { c: Math.max(0, original.c - 45) }, { a: 25, b: 25, c: 90, d: 0 }, { a: 75, b: 0, c: 25, d: 0 }]) {
        let current = evaluate({ ...original, ...seed });
        for (const step of [25, 12, 6, 3, 1]) for (let pass = 0; pass < 5; pass++) {
          let next = current;
          for (const [key, [min, max]] of Object.entries(limits)) for (const direction of [-1, 1]) {
            const candidate = evaluate({ ...current.pose, [key]: clamp(current.pose[key] + step * direction, min, max) });
            if (candidate.score < next.score - 1e-6) next = candidate;
          }
          if (next === current) break; current = next;
        }
        if (current.score < best.score) best = current;
        if (best.penetration === 0) break;
      }
      Object.assign(A, best.pose);
    }
    return p;
  }

  // Turn the neck and head (neck about a third, head the rest, within each joint's range) so the face
  // points at a world-space target. Signs: +neckYaw turns toward -x, +headYaw toward +x; +pitch looks down.
  function lookAt(pose, target, { quick = false } = {}) {
    const p = pose, lim = k => { const c = [...PARTS.neck.controls, ...PARTS.head.controls].find(c => c.path === k); return [c.min, c.max]; };
    // A comfortable range: about 75° to either side and 35° up or down; past that the eyes would do the rest.
    const apply = (Y, P) => {
      Y = clamp(Y, -75, 75); P = clamp(P, -35, 35);
      p.neckYaw = clamp(Y * 0.4, ...lim('neckYaw')); p.headYaw = clamp(-(Y - p.neckYaw), ...lim('headYaw'));
      p.neckPitch = clamp(P * 0.45, ...lim('neckPitch')); p.headPitch = clamp(P - p.neckPitch, ...lim('headPitch'));
      p.neckTilt = 0; p.headTilt = 0;
    };
    const err = (Y, P) => { apply(Y, P); const J = skeleton(p), d = norm(sub(target, J.head)); return 1 - dot(J.headForward, d); };
    // While following the pointer, continue from where the head already points (no full search).
    const start = [clamp(p.neckYaw - p.headYaw, -75, 75), clamp(p.neckPitch + p.headPitch, -35, 35)];
    let best = quick ? start : [0, 0], e = err(...best);
    if (!quick) for (let Y = -75; Y <= 75; Y += 5) for (let P = -35; P <= 35; P += 5) { const v = err(Y, P); if (v < e) { e = v; best = [Y, P]; } }
    for (const step of quick ? [16, 8, 4, 2, 1] : [5, 2, 1]) for (let pass = 0; pass < 3; pass++) for (const [dy, dp] of [[step, 0], [-step, 0], [0, step], [0, -step]]) {
      const Y = clamp(best[0] + dy, -75, 75), P = clamp(best[1] + dp, -35, 35), v = err(Y, P); if (v < e) { e = v; best = [Y, P]; }
    }
    apply(...best);
    for (const k of ['neckYaw', 'headYaw', 'neckPitch', 'headPitch']) p[k] = Math.round(p[k]);
    p.neckTilt = 0; p.headTilt = 0;
    return p;
  }

  /* ---------- reaching: move a hand or foot to a point (inverse kinematics) ---------- */
  // Solves the limb's main angles (raise, forward, bend) so `joint` lands on `target`,
  // measured from the pelvis so standing / lifting never fights the solve.
  const IK = {
    Arm: { keys: ["a", "b", "c"], min: [-35, -60, 0], max: [180, 180, 150] },
    Leg: { keys: ["a", "b", "c"], min: [-40, -10, 0], max: [120, 65, 145] }
  };
  function reach(pose, side, kind, joint, target, { quick = false, iterations = 40 } = {}) {
    const limbKey = side + kind, spec = IK[kind];
    const rel = q => { const J = skeleton(q); return sub(J[joint], J.pelvis); };
    const goal = sub(target, skeleton(pose).pelvis);
    const start = spec.keys.map(k => pose[limbKey][k]);
    function solveFrom(seed) {
      const p = JSON.parse(JSON.stringify(pose));
      spec.keys.forEach((k, i) => { p[limbKey][k] = clamp(seed[i], spec.min[i], spec.max[i]); });
      for (let it = 0; it < iterations; it++) {
        const now = rel(p), err = sub(now, goal);
        if (Math.hypot(...err) < 0.003) break;
        // Numerical Jacobian (metres per degree) and a damped least-squares step.
        const cols = spec.keys.map(k => { const q = JSON.parse(JSON.stringify(p)); q[limbKey][k] += 1; return sub(rel(q), now); });
        const A = [0, 1, 2].map(r => [0, 1, 2].map(c => cols.reduce((sum, col) => sum + col[r] * col[c], 0) + (r === c ? 4e-5 : 0)));
        const y = solve3(A, mul(err, -1));
        spec.keys.forEach((k, i) => { p[limbKey][k] = clamp(p[limbKey][k] + clamp(dot(cols[i], y), -20, 20), spec.min[i], spec.max[i]); });
      }
      const miss = Math.hypot(...sub(rel(p), goal));
      // Prefer reaching the point, then staying close to the current pose (no sudden flips).
      const change = spec.keys.reduce((sum, k, i) => sum + Math.abs(p[limbKey][k] - start[i]), 0);
      return { p, miss, cost: miss + change * 0.0001 };
    }
    // While dragging, continue from the current pose; only search more starts when stuck.
    if (quick) { const r = solveFrom(start); if (r.miss < 0.03) return r.p; }
    // A straight limb is a singular start (it cannot tell which way to swing), so try a few.
    const seeds = [start, [start[0], start[1] + 45, start[2] + 20], [start[0] + 45, start[1], start[2] + 20], [start[0], start[1], start[2] + 60],
      ...(kind === "Arm" ? [[15, 80, 15], [90, 10, 20], [50, 50, 60], [10, 30, 110], [150, 20, 20]] : [[40, 5, 40], [90, 5, 90], [-20, 5, 20]])];
    return seeds.map(solveFrom).sort((a, b) => a.cost - b.cost)[0].p;
  }
  function solve3(A, b) {
    const det = m => m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) - m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) + m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0]);
    const d = det(A) || 1e-12;
    return [0, 1, 2].map(i => det(A.map((row, r) => row.map((x, c) => (c === i ? b[r] : x)))) / d);
  }

  /* ---------- key light ---------- */
  // az / el like the camera (world azimuth); soft or hard shadows.
  function normalizeLight(raw = {}) {
    if (!raw || typeof raw !== "object") raw = {};
    return { az: wrap360(finite(raw.az, 315)), el: clamp(finite(raw.el, 40), -20, 89), soft: raw.soft !== false };
  }
  const lightDir = l => camDir(l);
  // Words from where the light sits relative to the camera, so they describe the photo.
  function describeLight(light, cam, lang) {
    const l = normalizeLight(light), c = normalizeCamera(cam), zh = lang === "zh", i = zh ? 0 : 1;
    const words = [];
    if (l.el > 68) words.push(["顶光,光从正上方打下", "top lighting from directly above"][i]);
    else if (l.el < -5) words.push(["底光,光从下方往上照", "lighting from below"][i]);
    else {
      const rel = ((((l.az - c.az) % 360) + 540) % 360) - 180, a = Math.abs(rel);
      // From the camera's point of view, positive rel means the light is on the frame's left.
      const sideWord = rel > 0 ? ["左", "left"] : ["右", "right"];
      if (a < 35) words.push(["顺光,光从镜头方向照来", "front lighting from the camera direction"][i]);
      else if (a < 70) words.push(zh ? `${sideWord[0]}前方的斜侧光,伦勃朗光` : `Rembrandt lighting from the front ${sideWord[1]}`);
      else if (a < 125) words.push(zh ? `${sideWord[0]}侧光,一半脸在阴影里` : `side lighting from the ${sideWord[1]}, half the face in shadow`);
      else words.push(["逆光,人物边缘有一圈轮廓光", "backlit, with a rim light around the subject"][i]);
    }
    words.push(l.soft ? ["柔光,阴影柔和", "soft light with gentle shadows"][i] : ["硬光,阴影清晰", "hard light with crisp shadows"][i]);
    return words.join(zh ? "," : ", ");
  }
  const LIGHT_PRESETS = [
    { zh: "顺光", en: "Front", rel: 0, el: 25 }, { zh: "伦勃朗光", en: "Rembrandt", rel: 50, el: 40 },
    { zh: "左侧光", en: "Left side", rel: 90, el: 15 }, { zh: "右侧光", en: "Right side", rel: -90, el: 15 },
    { zh: "逆光", en: "Backlight", rel: 180, el: 25 }, { zh: "顶光", en: "Top", rel: 0, el: 80 }
  ];
  function normalizeCamera(raw = {}) {
    if (!raw || typeof raw !== 'object') raw = {};
    const old = clamp(finite(raw.dist, 1), 0.6, 1.4);
    const legacy = old <= 1 ? 0.65 + (old - 0.6) / 0.4 * 2.15 : 2.8 + (old - 1) / 0.4 * 4.2;
    return { version: 2, az: wrap360(finite(raw.az, 45)), el: clamp(finite(raw.el, 10), -60, 85), distance: clamp(finite(raw.distance, legacy), CAMERA.minDistance, CAMERA.maxDistance), focus: ['head', 'chest', 'whole'].includes(raw.focus) ? raw.focus : 'chest', lens: LENSES.includes(+raw.lens) ? +raw.lens : 0 };
  }

  /** Everything a host needs from a saved studio value: camera, pose and light words. */
  function describeScene(value = {}, lang = "en", aspect = 1) {
    const pose = normalizePose(value.pose), cam = normalizeCamera(value.cam), J = skeleton(pose);
    const two = value.second && value.pose2 ? normalizePose(value.pose2) : null, J2 = two ? skeleton(two) : null;
    let poseText = describePose(pose, cam, lang);
    if (two) {
      // Name the two people by where they appear in the frame.
      const spec = shotCamera(cam, J), view = makeView(spec.pos, spec.target, spec.fov, 100 * aspect, 100);
      const xa = (view.project(J.chest) || { x: 0 }).x, xb = (view.project(J2.chest) || { x: 0 }).x, aLeft = xa <= xb, zh = lang === "zh";
      const label = left => zh ? (left ? "左边的人:" : "右边的人:") : (left ? "person on the left: " : "person on the right: ");
      poseText = `${label(aLeft)}${poseText}${zh ? ";" : "; "}${label(!aLeft)}${describePose(two, cam, lang)}`;
    }
    return { camera: describeCamera(cam, lang, pose.yaw, J, aspect, J2), pose: poseText, light: describeLight(value.light, cam, lang) };
  }

  return { lookAt, LENSES, camFov, attachRotation, setCollisionData, setSeated, PALM, resolveArms, armPenetration, bindPose, PROP_ATTACHMENTS, propFrame, migratePose, handRig, skinFrames, holdProp, GRIPS, FINGERS, modelDistance, spaceModels, mm, describeScene, BODY_TYPES, PROPS, reach, normalizeLight, lightDir, describeLight, LIGHT_PRESETS, D2R, clamp, v, add, sub, mul, dot, cross, norm, rx, ry, rz, mv, chain, BASE, P, PRESETS, B, measurements, skeleton, CAMERA, camDir, shotCamera, framedCamera, cameraTarget, cameraBounds, constrainCamera, minCameraElevation, fitCameraDistance, cameraControlPoint, dragCameraControl, makeView, describeCamera, describePose, T, CAM_PRESETS, PARTS, get, put, wrap360, normalizePose, normalizeCamera };
})();
