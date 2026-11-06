const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), vm = require('node:vm'), path = require('node:path');
const { auditMesh } = require('./mesh-collision-audit.cjs');
const context = vm.createContext({ console, atob });
for (const file of ['vendor/three.min.js', 'studio-model.js', 'studio-body-data.js', 'studio-surface.js']) vm.runInContext(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), context);
const { M, T, surface } = vm.runInContext('({M:CamPoseModel,T:THREE,surface:StudioSurface.create(CamPoseModel,new THREE.MeshStandardMaterial(),new THREE.Group())})', context);
const full = process.env.STUDIO_FULL_AUDIT === '1';
const reported = [
  { id: 'phone', prop: 'phone' }, { id: 'hips' }, { id: 'run' },
  { id: 'run', prop: 'phone', seated: true }, { id: 'stand', prop: 'phone', seated: true },
  { id: 'think', prop: 'cup' }, { id: 'think', prop: 'book' },
  { id: 'sit', prop: 'phone', seated: true, chair: true }
];
const cases = full ? M.PRESETS.flatMap(p => [null, 'phone', 'cup', 'book', 'umbrella'].flatMap(prop => [false, true].map(seated => ({ id: p.id, prop, seated })))).concat([null, 'phone', 'cup', 'book', 'umbrella'].map(prop => ({ id: 'sit', prop, seated: true, chair: true }))) : reported;
for (const body of Object.keys(M.BODY_TYPES)) test(`actual mesh contact checks: ${body} (${cases.length} combinations)`, () => {
  for (const item of cases) {
    let p = M.normalizePose({ ...M.PRESETS.find(v => v.id === item.id).pose, body, preset: item.id });
    if (item.prop) p = M.holdProp(p, item.prop);
    if (item.seated) p = M.setSeated(p, true);
    if (item.chair) p.props.push('chair');
    M.resolveArms(p);
    const audit = auditMesh(surface, M, T, p, item.prop), label = JSON.stringify({ body, ...item });
    for (const [part, count] of Object.entries(audit.counts)) assert.equal(count, 0, `${label}: ${part} intersects actual body or furniture`);
    assert.ok(audit.floor >= -0.004 * M.BODY_TYPES[body].height, `${label}: foot below floor ${audit.floor}`);
  }
});

test('on the phone: the phone rests beside the right ear, not across the face or above the head', () => {
  for (const body of Object.keys(M.BODY_TYPES)) {
    const p = M.holdProp(M.normalizePose({ ...M.PRESETS.find(v => v.id === 'phone').pose, body, preset: 'phone', props: ['phone'] }), 'phone');
    p.preset = 'phone'; M.resolveArms(p);
    const J = M.skeleton(p), F = M.propFrame(p, 'phone', J), H = J.headM, T = [H[0], H[3], H[6], H[1], H[4], H[7], H[2], H[5], H[8]];
    const local = v => M.mul(M.mv(T, M.sub(v, J.head)), 1 / J.headSize), c = local(F.position);
    assert.ok(c[0] < -0.07 && c[0] > -0.14, `${body}: phone not beside the right side of the head (${c})`);
    assert.ok(Math.abs(c[1]) < 0.06 && c[2] > -0.04 && c[2] < 0.08, `${body}: phone not at ear height (${c})`);
    assert.ok(local(J.rWrist)[1] < 0.04, `${body}: wrist should not be above the ear`);
    assert.equal(M.armPenetration(p, 'r'), 0, `${body}: arm or phone intersects the body`);
  }
});
