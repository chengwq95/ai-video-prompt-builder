// Compile pinned CC0 MakeHuman geometry/weights into an offline, anatomical drawing rig.
// node tools/build-body.cjs --source-dir=../human-source
// node tools/build-body.cjs --download (fetches the same pinned CC0 assets into tools/.human-cache)
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const revision = 'a8bc2d54ff0ac92e78ff71431b1023eda42bf482';
const root = path.resolve(__dirname, '..');
const supplied = process.argv.find(x => x.startsWith('--source-dir='));
const source = supplied ? path.resolve(supplied.split('=').slice(1).join('=')) : path.join(__dirname, '.human-cache');
const files = ['LICENSE.ASSETS.md', 'makehuman/data/3dobjs/base.obj', 'makehuman/data/rigs/default.mhskel', 'makehuman/data/rigs/default_weights.mhw'];
for (const race of ['african', 'asian', 'caucasian']) for (const [sex, age] of [['male', 'young'], ['female', 'young'], ['male', 'child'], ['female', 'child']]) files.push(`makehuman/data/targets/macrodetails/${race}-${sex}-${age}.target`);
for (const shape of ['maxmuscle-averageweight', 'minmuscle-minweight']) files.push(`makehuman/data/targets/macrodetails/universal-male-young-${shape}.target`);
async function main() {
  if (process.argv.includes('--download')) {
    fs.mkdirSync(source, { recursive: true });
    await Promise.all(files.map(async file => {
      const response = await fetch(`https://raw.githubusercontent.com/makehumancommunity/makehuman/${revision}/${file}`);
      if (!response.ok) throw new Error(`${file}: ${response.status}`);
      fs.writeFileSync(path.join(source, path.basename(file)), Buffer.from(await response.arrayBuffer()));
    }));
  }
  const read = file => fs.readFileSync(path.join(source, file), 'utf8');
  const manifestPath = path.join(root, 'tools/human-assets-manifest.json');
  if (fs.existsSync(manifestPath)) {
    const expected = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    if (expected.revision !== revision) throw new Error('Source manifest revision does not match');
    for (const file of expected.files) {
      const hash = crypto.createHash('sha256').update(fs.readFileSync(path.join(source, path.basename(file.path)))).digest('hex');
      if (hash !== file.sha256) throw new Error('Source checksum mismatch: ' + file.path);
    }
  }
  const rig = JSON.parse(read('default.mhskel')), nativeWeights = JSON.parse(read('default_weights.mhw')).weights;
  const context = vm.createContext({ console });
  vm.runInContext(fs.readFileSync(path.join(root, 'studio-model.js'), 'utf8'), context);
  const M = vm.runInContext('CamPoseModel', context), identity = [1, 0, 0, 0, 1, 0, 0, 0, 1];
  const raw = [], rawFaces = []; let group = '';
  for (const line of read('base.obj').split('\n')) {
    if (line.startsWith('v ')) raw.push(line.trim().split(/\s+/).slice(1).map(Number));
    if (line.startsWith('g ')) group = line.trim().slice(2);
    if (line.startsWith('f ') && group === 'body') rawFaces.push(line.trim().split(/\s+/).slice(1).map(s => +s.split('/')[0] - 1));
  }
  const used = [...new Set(rawFaces.flat())].sort((a, b) => a - b), map = new Map(used.map((v, i) => [v, i]));
  const faces = rawFaces.map(f => f.map(i => map.get(i)));
  const adjacent = used.map(() => new Set());
  for (const face of faces) face.forEach((a, i) => { const b = face[(i + 1) % face.length]; adjacent[a].add(b); adjacent[b].add(a); });
  const bind = M.bindPose();
  const keys = Object.keys(M.skinFrames(bind));
  const roles = name => {
    const side = name.endsWith('.L') ? 'l' : name.endsWith('.R') ? 'r' : null;
    const finger = name.match(/^finger([1-5])-([1-3])/);
    if (finger) return side + ['thumb', 'index', 'middle', 'ring', 'pinky'][+finger[1] - 1] + (+finger[2] - 1);
    if (name.startsWith('upperarm')) return side + 'Upper';
    if (name.startsWith('lowerarm')) return side + 'Fore';
    if (name.startsWith('wrist') || name.startsWith('metacarpal')) return side + 'Hand';
    if (name.startsWith('upperleg')) return side + 'Thigh';
    if (name.startsWith('lowerleg')) return side + 'Shin';
    if (name.startsWith('foot')) return side + 'Foot';
    if (name.startsWith('toe')) return side + 'Toes';
    if (name.startsWith('clavicle') || name.startsWith('shoulder')) return side + 'Clavicle';
    if (name.startsWith('neck')) return 'neck';
    if (name === 'root' || name.startsWith('pelvis') || /^spine0[45]/.test(name)) return 'pelvis';
    if (name.startsWith('spine') || name.startsWith('breast')) return 'torso';
    return 'head';
  };
  const weights = used.map(() => new Map());
  for (const [name, entries] of Object.entries(nativeWeights)) {
    const bone = keys.indexOf(roles(name));
    if (bone < 0) throw new Error('Unmapped bone: ' + name);
    for (const [vertex, weight] of entries) if (map.has(vertex)) {
      const w = weights[map.get(vertex)]; w.set(bone, (w.get(bone) || 0) + weight);
    }
  }
  const normalize = w => {
    const sum = [...w.values()].reduce((a, b) => a + b, 0);
    if (sum < 1e-8) throw new Error('Unweighted body vertex');
    return new Map([...w].map(([k, v]) => [k, v / sum]));
  };
  weights.forEach((w, i) => { weights[i] = normalize(w); });
  const average = points => [0, 1, 2].map(a => points.reduce((sum, p) => sum + p[a], 0) / points.length);
  const HAND_WIDTH = 1, HAND_THICKNESS = 1.06, FINGER_THICKNESS = 1.04;
  const transposed = R => [R[0], R[3], R[6], R[1], R[4], R[7], R[2], R[5], R[8]];
  const axisFrame = (a, b, across = [1, 0, 0]) => {
    const y = M.norm(M.sub(a, b)); let x = M.norm(M.sub(across, M.mul(y, M.dot(across, y))));
    if (Math.hypot(...M.cross(x, y)) < 0.01) x = M.norm(M.cross(y, [0, 0, 1]));
    const z = M.norm(M.cross(x, y)); x = M.cross(y, z);
    return [x[0], y[0], z[0], x[1], y[1], z[1], x[2], y[2], z[2]];
  };
  // A neutral drawing mannequin: no nipples and no genital detail. Each nipple is pressed onto a smooth
  // quadric fitted through the skin around it (the chest or breast keeps its form); the groin is smoothed
  // strongly enough to flatten genital shapes into a plain mannequin surface.
  function neutralDetails(points, J) {
    const out = points.map(p => [...p]), q = v => M.mul(M.sub(v, J.pelvis), 1 / J.scale), back = (l, axis) => J.pelvis[axis] + l * J.scale;
    for (const side of [1, -1]) {
      let tip = -1, best = -Infinity;
      out.forEach((v, i) => { const l = q(v); if (side * l[0] > 0.03 && side * l[0] < 0.16 && l[1] > 0.18 && l[1] < 0.42 && l[2] > best) { best = l[2]; tip = i; } });
      if (tip < 0) continue;
      const c = q(out[tip]), ring = [], inner = [];
      out.forEach((v, i) => { const l = q(v), r = Math.hypot(l[0] - c[0], l[1] - c[1]); if (l[2] < c[2] - 0.05) return; if (r > 0.014 && r < 0.026) ring.push(l); else if (r <= 0.014) inner.push([i, l, r]); });
      const A = Array.from({ length: 6 }, () => new Array(6).fill(0)), b = new Array(6).fill(0);
      for (const l of ring) { const x = l[0] - c[0], y = l[1] - c[1], f = [1, x, y, x * x, y * y, x * y]; for (let r = 0; r < 6; r++) { b[r] += f[r] * l[2]; for (let k = 0; k < 6; k++) A[r][k] += f[r] * f[k]; } }
      for (let r = 0; r < 6; r++) A[r][r] += 1e-9;
      for (let i = 0; i < 6; i++) {
        let m = i; for (let r = i + 1; r < 6; r++) if (Math.abs(A[r][i]) > Math.abs(A[m][i])) m = r;
        [A[i], A[m]] = [A[m], A[i]]; [b[i], b[m]] = [b[m], b[i]];
        for (let r = 0; r < 6; r++) if (r !== i) { const t = A[r][i] / A[i][i]; for (let k = i; k < 6; k++) A[r][k] -= t * A[i][k]; b[r] -= t * b[i]; }
      }
      const co = b.map((v, i) => v / A[i][i]);
      for (const [i, l, r] of inner) {
        const x = l[0] - c[0], y = l[1] - c[1], z = co[0] + co[1] * x + co[2] * y + co[3] * x * x + co[4] * y * y + co[5] * x * y;
        const t = M.clamp((0.014 - r) / 0.005, 0, 1), w = t * t * (3 - 2 * t);
        out[i][2] = back(l[2] + (Math.min(l[2], z) - l[2]) * w, 2);
      }
    }
    const gauss = (x, width) => Math.exp(-((x / width) ** 2));
    const mask = out.map(v => { const l = q(v); return M.clamp(gauss(l[0], 0.07) * gauss(l[1] + 0.12, 0.085) * M.clamp((l[2] + 0.005) / 0.05, 0, 1) * 1.4, 0, 1); });
    let smooth = out;
    for (let pass = 0; pass < 45; pass++) smooth = smooth.map((point, i) => {
      const weight = mask[i] * 0.6; if (weight < 0.003) return point;
      const mean = average([...adjacent[i]].map(n => smooth[n]));
      return point.map((v, a) => v + (mean[a] - v) * weight);
    });
    return smooth;
  }
  const shapes = {};
  for (const body of Object.keys(M.BODY_TYPES)) {
    const points = raw.map(v => [...v]);
    const addTarget = (name, factor) => {
      for (const line of read(name + '.target').split('\n')) {
        if (!line.trim() || line.startsWith('#')) continue;
        const [id, x, y, z] = line.trim().split(/\s+/).map(Number);
        points[id][0] += x * factor; points[id][1] += y * factor; points[id][2] += z * factor;
      }
    };
    const sexAge = body === 'child' ? [['male', 'child', 0.5], ['female', 'child', 0.5]] : [[body === 'female' ? 'female' : 'male', 'young', 1]];
    for (const [sex, age, weight] of sexAge) for (const race of ['african', 'asian', 'caucasian']) addTarget(`${race}-${sex}-${age}`, weight / 3);
    if (body === 'strong') addTarget('universal-male-young-maxmuscle-averageweight', 0.9);
    if (body === 'slim') addTarget('universal-male-young-minmuscle-minweight', 0.6);
    points.forEach(p => { p[0] /= 10; p[1] /= 10; p[2] /= 10; });
    const joint = name => average(rig.joints[name].map(i => points[i]));
    const bone = name => { const b = rig.bones[name]; return { head: joint(b.head), tail: joint(b.tail) }; };
    const native = {}, pose = { ...bind, body }, J = M.skeleton(pose), target = M.skinFrames(pose, J);
    const shoulders = ['L', 'R'].map(s => bone('upperarm01.' + s).head), hips = ['L', 'R'].map(s => bone('upperleg01.' + s).head);
    const pelvis = M.add(average(hips), [0, 0.04, 0]), chest = M.add(average(shoulders), [0, 0.02, 0]);
    const spineLength = chest[1] - pelvis[1], waist = M.add(pelvis, M.mul(M.sub(chest, pelvis), 0.2 / M.B.spine));
    const head = bone('head'), headCenter = average([head.head, head.tail]);
    const headYs = used.filter((_, i) => (weights[i].get(keys.indexOf('head')) || 0) > 0.8).map(i => points[i][1]);
    const allY = used.map(i => points[i][1]);
    const globalScale = (J.head[1] + J.headSize * 0.125) / (Math.max(...allY) - Math.min(...allY));
    const torsoScale = M.measurements(body).spine * J.scale / spineLength;
    const frame = (origin, matrix = identity, scale = [globalScale, globalScale, globalScale]) => ({ origin, matrix, scale });
    native.pelvis = frame(pelvis);
    native.torso = frame(waist, identity, [globalScale, torsoScale, globalScale]);
    native.neck = frame(chest, identity, [globalScale, (J.head[1] - J.chest[1]) / (headCenter[1] - chest[1]), globalScale]);
    const headScale = 0.24 * J.headSize / (Math.max(...headYs) - Math.min(...headYs));
    native.head = frame(headCenter, identity, [headScale, headScale, headScale]);
    for (const [s, suffix] of [['l', 'L'], ['r', 'R']]) {
      const a = bone('upperarm01.' + suffix).head, e = bone('lowerarm01.' + suffix).head, w = bone('wrist.' + suffix).head;
      const hp = bone('upperleg01.' + suffix).head, k = bone('lowerleg01.' + suffix).head, ankle = bone('foot.' + suffix).head;
      const middle = bone('finger3-1.' + suffix).head;
      const across = M.mul(M.sub(bone('finger2-1.' + suffix).head, bone('finger5-1.' + suffix).head), s === 'l' ? 1 : -1);
      const handR = axisFrame(w, middle, across), handX = [handR[0], handR[3], handR[6]];
      native[s + 'Clavicle'] = frame(chest, identity, [globalScale, torsoScale, globalScale]);
      // Limbs are stretched to the editor's proportions along their length only, which makes them read
      // thin. Give arms, hands and fingers back some thickness so they keep a sturdy, drawable volume.
      const bulk = { Upper: 1.1, Fore: 1.14, Thigh: 1, Shin: 1 };
      for (const [role, from, to, length] of [['Upper', a, e, 'upper'], ['Fore', e, w, 'fore'], ['Thigh', hp, k, 'thigh'], ['Shin', k, ankle, 'shin']]) native[s + role] = frame(from, axisFrame(from, to), [globalScale * bulk[role], M.measurements(body)[length] * J.scale / Math.hypot(...M.sub(to, from)), globalScale * bulk[role]]);
      // The source palm is rolled ~123 degrees relative to the forearm's default
      // transverse frame. Unwind that difference gradually before retargeting;
      // otherwise the two weighted surfaces cancel at the wrist, forming a pinch.
      const wristAcross = M.mv(transposed(native[s + 'Fore'].matrix), handX);
      native[s + 'Fore'].wristRoll = Math.atan2(wristAcross[2], wristAcross[0]) / M.D2R;
      const width = Math.hypot(...across);
      native[s + 'Hand'] = frame(w, handR, [M.PALM.width * J.handSize / width * HAND_WIDTH, M.PALM.length * J.handSize / Math.hypot(...M.sub(middle, w)), globalScale * HAND_THICKNESS]);
      native[s + 'Foot'] = frame(ankle);
      // Anchor the toe frame so that, in the bind pose, toe vertices land exactly where the foot frame
      // would put them. Otherwise the toes are shifted against the foot and leave a ledge at their base.
      const footTo = target[s + 'Foot'], toesTo = target[s + 'Toes'];
      native[s + 'Toes'] = frame(M.add(ankle, M.mul(M.mv(transposed(footTo.matrix), M.sub(toesTo.position, footTo.position)), 1 / globalScale)));
      ['thumb', 'index', 'middle', 'ring', 'pinky'].forEach((finger, index) => {
        for (let segment = 0; segment < 3; segment++) {
          const name = s + finger + segment, part = bone(`finger${index + 1}-${segment + 1}.${suffix}`);
          native[name] = frame(part.head, axisFrame(part.head, part.tail, handX), [globalScale * FINGER_THICKNESS, target[name].length / Math.hypot(...M.sub(part.tail, part.head)), globalScale * FINGER_THICKNESS]);
        }
      });
    }
    const transformed = used.map((id, i) => {
      const sum = [0, 0, 0];
      for (const [index, weight] of weights[i]) {
        const name = keys[index], from = native[name], to = target[name];
        const local = M.mv(transposed(from.matrix), M.sub(points[id], from.origin)).map((v, axis) => v * from.scale[axis]);
        if (name === 'lFore' || name === 'rFore') {
          const t = M.clamp((-local[1] / (M.measurements(body).fore * J.scale) - 0.2) / 0.65, 0, 1);
          const aligned = M.mv(M.ry(from.wristRoll * t * t * (3 - 2 * t)), local);
          local[0] = aligned[0]; local[2] = aligned[2];
        }
        if (/^(l|r)(Upper|Fore)$/.test(name)) {
          const length = M.measurements(body)[name.endsWith('Upper') ? 'upper' : 'fore'] * J.scale;
          const t = M.clamp(-local[1] / length, 0, 1);
          // Add muscle through the belly, tapering to the original joint dimensions.
          // Keep the slim build distinct and avoid a swollen wrist or elbow seam.
          const fullness = { female: 0.12, male: 0.07, slim: 0.025, strong: 0.04, child: 0.05 }[body];
          const radial = 1 + fullness * Math.sin(Math.PI * t) ** 0.8;
          local[0] *= radial; local[2] *= radial;
        }
        const out = M.add(to.position, M.mv(to.matrix, local));
        for (let axis = 0; axis < 3; axis++) sum[axis] += out[axis] * weight;
      }
      return sum;
    });
    // Preserve anatomical volumes while simplifying small surface details for a
    // neutral drawing mannequin. Hands and joint transitions are left untouched.
    const gauss = (x, width) => Math.exp(-((x / width) ** 2));
    const detail = transformed.map(v => {
      const q = M.mul(M.sub(v, J.pelvis), 1 / J.scale);
      const front = M.clamp((q[2] - 0.025) / 0.06, 0, 1);
      const groin = gauss(q[0], 0.055) * gauss(q[1] + 0.105, 0.075) * front;
      const chest = gauss(Math.abs(q[0]) - 0.075, 0.035) * gauss(q[1] - (M.measurements(body).spine - 0.15), 0.035) * M.clamp((q[2] - 0.11) / 0.05, 0, 1);
      return Math.max(groin, chest);
    });
    let smooth = transformed;
    for (let pass = 0; pass < 16; pass++) smooth = smooth.map((point, i) => {
      const weight = detail[i] * 0.55; if (weight < 0.003) return point;
      const mean = average([...adjacent[i]].map(n => smooth[n]));
      return point.map((v, a) => v + (mean[a] - v) * weight);
    });
    shapes[body] = neutralDetails(smooth, J);
  }
  // Subdivide the anatomical edge loops once, retaining the artist-authored skin weights.
  const edges = [], lookup = new Map(), vertexFaces = used.map(() => []), vertexEdges = used.map(() => []);
  faces.forEach((face, fi) => face.forEach((a, i) => {
    vertexFaces[a].push(fi); const b = face[(i + 1) % face.length], key = Math.min(a, b) + ':' + Math.max(a, b);
    let ei = lookup.get(key);
    if (ei === undefined) { ei = edges.length; lookup.set(key, ei); edges.push({ a, b, faces: [] }); vertexEdges[a].push(ei); vertexEdges[b].push(ei); }
    edges[ei].faces.push(fi);
  }));
  const mergeWeights = entries => {
    const out = new Map(); for (const [w, factor] of entries) for (const [b, v] of w) out.set(b, (out.get(b) || 0) + v * factor);
    return normalize(out);
  };
  const faceWeights = faces.map(f => mergeWeights(f.map(i => [weights[i], 1 / f.length])));
  const edgeWeights = edges.map(e => mergeWeights([[weights[e.a], 0.5], [weights[e.b], 0.5]]));
  const finalWeights = [...weights, ...edgeWeights, ...faceWeights];
  const quads = [];
  faces.forEach((f, fi) => f.forEach((v, i) => {
    const next = f[(i + 1) % f.length], prev = f[(i + f.length - 1) % f.length];
    const e1 = lookup.get(Math.min(v, next) + ':' + Math.max(v, next)), e0 = lookup.get(Math.min(v, prev) + ':' + Math.max(v, prev));
    quads.push([v, used.length + e1, used.length + edges.length + fi, used.length + e0]);
  }));
  const indices = Uint16Array.from(quads.flatMap(([a, b, c, d]) => [a, b, c, a, c, d]));
  if (finalWeights.length > 65535) throw new Error('Too many vertices for 16-bit indices');
  const encode = data => Buffer.from(data.buffer, data.byteOffset, data.byteLength).toString('base64');
  const variants = {};
  for (const [body, points] of Object.entries(shapes)) {
    const centers = faces.map(f => average(f.map(i => points[i])));
    const edgePoints = edges.map(e => e.faces.length === 2 ? average([points[e.a], points[e.b], ...e.faces.map(i => centers[i])]) : average([points[e.a], points[e.b]]));
    const adjusted = points.map((point, i) => {
      const boundary = vertexEdges[i].map(e => edges[e]).filter(e => e.faces.length === 1);
      if (boundary.length === 2) return point.map((v, a) => 0.75 * v + boundary.reduce((sum, e) => sum + points[e.a === i ? e.b : e.a][a], 0) * 0.125);
      const n = vertexFaces[i].length, F = average(vertexFaces[i].map(f => centers[f])), R = average(vertexEdges[i].map(e => average([points[edges[e].a], points[edges[e].b]])));
      return point.map((v, a) => (F[a] + 2 * R[a] + (n - 3) * v) / n);
    });
    variants[body] = { position: encode(Int16Array.from([...adjusted, ...edgePoints, ...centers].flat(), v => Math.round(v * 10000))) };
  }
  // Give each forearm vertex two adjacent twist frames. All variants share the
  // authored topology, so use the bind mesh's normalized distance down the arm.
  const rawReference = Buffer.from(variants.male.position, 'base64');
  const bindPositions = new Int16Array(rawReference.buffer, rawReference.byteOffset, rawReference.byteLength / 2);
  const bindFrames = M.skinFrames(M.bindPose('male'));
  finalWeights.forEach((w, i) => {
    for (const side of ['l', 'r']) {
      const full = keys.indexOf(side + 'Fore'), amount = w.get(full); if (!amount) continue;
      const frame = bindFrames[side + 'Fore'];
      const vertex = [0, 1, 2].map(a => bindPositions[i * 3 + a] / 10000);
      const local = M.mv(transposed(frame.matrix), M.sub(vertex, frame.position));
      const t = M.clamp(-local[1] / M.measurements('male').fore, 0, 1);
      const stops = [[0.10, 'ForeBase'], [0.38, 'ForeMid'], [0.68, 'ForeDist'], [0.90, 'Fore']];
      let segment = 0; while (segment < 2 && t > stops[segment + 1][0]) segment++;
      const mix = M.clamp((t - stops[segment][0]) / (stops[segment + 1][0] - stops[segment][0]), 0, 1);
      w.delete(full);
      for (const [name, factor] of [[stops[segment][1], 1 - mix], [stops[segment + 1][1], mix]]) {
        if (factor > 0) { const id = keys.indexOf(side + name); w.set(id, (w.get(id) || 0) + amount * factor); }
      }
    }
  });
  const ids = new Uint8Array(finalWeights.length * 4), values = new Uint8Array(ids.length);
  finalWeights.forEach((w, i) => {
    const top = [...w].sort((a, b) => b[1] - a[1]).slice(0, 4), sum = top.reduce((n, x) => n + x[1], 0); let quantized = 0;
    top.forEach(([bone, weight], j) => { ids[i * 4 + j] = bone; values[i * 4 + j] = Math.round(weight / sum * 255); quantized += values[i * 4 + j]; });
    values[i * 4] += 255 - quantized;
  });
  const data = { version: 3, source: { project: 'MakeHuman', revision, license: 'CC0-1.0' }, vertices: finalWeights.length, bones: keys, variants, skinIndex: encode(ids), skinWeight: encode(values), index: encode(indices) };
  fs.writeFileSync(path.join(root, 'studio-body-data.js'), '// CC0 MakeHuman anatomical mesh and weights; generated by tools/build-body.cjs.\nconst StudioBodyData = ' + JSON.stringify(data) + ';\n');
  const manifest = { revision, files: files.map(file => ({ path: file, sha256: crypto.createHash('sha256').update(fs.readFileSync(path.join(source, path.basename(file)))).digest('hex') })) };
  fs.writeFileSync(path.join(root, 'tools/human-assets-manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  fs.copyFileSync(path.join(source, 'LICENSE.ASSETS.md'), path.join(root, 'vendor/HUMAN-ASSETS-LICENSE.md'));
  console.log(`Generated ${data.vertices} vertices, ${indices.length / 3} triangles, ${keys.length} anatomical skinning bones; ${edges.filter(e => e.faces.length === 1).length} boundary edges.`);
}
main().catch(e => { console.error(e); process.exitCode = 1; });
