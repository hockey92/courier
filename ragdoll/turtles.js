// The four teenage ninja turtles who live in the sewer lair: built from boxes, posed by hand every frame.
import * as THREE from 'three';
import { addBox, mat } from './materials.js';

export const TURTLE_KINDS = {
  blue: { mask: '#2f6fd6', weapon: 'katana' },
  red: { mask: '#d6312f', weapon: 'sai' },
  purple: { mask: '#7d3fc4', weapon: 'bo' },
  orange: { mask: '#f08a1c', weapon: 'nunchucks' },
};

// Faces +x with its feet at the origin, about 1.45 m tall. Limbs are groups hinged at the joint:
// rotation.z swings them forward, rotation.x out to the side (order ZYX so "out" stays out when raised).
export function buildTurtle(parent, kind) {
  const { mask, weapon } = TURTLE_KINDS[kind];
  const g = new THREE.Group(); parent.add(g);
  const body = new THREE.Group(); g.add(body);
  const skin = mat('#6aa84f'), band = mat(mask), pad = mat('#7a5230'), wrap = mat('#cdb98e');
  const lines = mat('#b5a35c'), mouth = mat('#2a3a1e');
  const steel = mat('#dfe6ee', { metalness: 0.7, roughness: 0.3 });

  addBox(body, 0.36, 0.52, 0.44, skin, 0, 0.88, 0);
  addBox(body, 0.05, 0.46, 0.36, mat('#d8c47a'), 0.19, 0.88, 0);           // plastron
  for (const y of [0.76, 0.88, 1.0]) addBox(body, 0.052, 0.014, 0.34, lines, 0.192, y, 0);
  addBox(body, 0.052, 0.4, 0.014, lines, 0.192, 0.88, 0);
  addBox(body, 0.14, 0.6, 0.52, mat('#5b6b2a'), -0.22, 0.88, 0);           // shell
  addBox(body, 0.07, 0.44, 0.38, mat('#46531f'), -0.32, 0.88, 0);
  addBox(body, 0.46, 0.07, 0.47, mat('#6b4424'), 0, 0.66, 0);              // belt
  addBox(body, 0.02, 0.09, 0.11, mat('#c9a24a'), 0.235, 0.66, 0);          // buckle

  const head = new THREE.Group(); head.position.set(0.03, 1.14, 0); body.add(head);
  addBox(head, 0.14, 0.08, 0.14, skin, 0, 0.02, 0);                        // neck
  addBox(head, 0.3, 0.26, 0.3, skin, 0.03, 0.17, 0);
  addBox(head, 0.05, 0.11, 0.24, skin, 0.2, 0.1, 0);                       // snout
  addBox(head, 0.31, 0.075, 0.31, band, 0.03, 0.205, 0);                   // mask
  for (const s of [-1, 1]) {
    addBox(head, 0.012, 0.05, 0.07, mat('#fff'), 0.19, 0.205, s * 0.07);   // eyes
    addBox(head, 0.012, 0.032, 0.026, mat('#111'), 0.197, 0.2, s * 0.06);
    addBox(head, 0.012, 0.018, 0.03, mouth, 0.226, 0.093, s * 0.085);       // corners of the grin
  }
  addBox(head, 0.012, 0.018, 0.16, mouth, 0.226, 0.08, 0);
  const tails = new THREE.Group(); tails.position.set(-0.125, 0.205, 0); head.add(tails); // mask tails
  for (const s of [-1, 1]) addBox(tails, 0.03, 0.24, 0.05, band, -0.03, -0.1, s * 0.05).rotation.x = s * 0.15;

  const arms = [-1, 1].map(s => {
    const sh = new THREE.Group(); sh.position.set(0, 1.06, s * 0.3); sh.rotation.order = 'ZYX'; body.add(sh);
    addBox(sh, 0.13, 0.25, 0.13, skin, 0, -0.125, 0);
    const el = new THREE.Group(); el.position.set(0, -0.25, 0); sh.add(el);
    addBox(el, 0.15, 0.07, 0.15, pad, -0.01, 0, 0);                        // elbow pad
    addBox(el, 0.12, 0.22, 0.12, skin, 0, -0.12, 0);
    addBox(el, 0.135, 0.05, 0.135, wrap, 0, -0.2, 0);                      // wrist wrap
    const hand = new THREE.Group(); hand.position.set(0, -0.26, 0); el.add(hand);
    addBox(hand, 0.13, 0.11, 0.13, skin, 0, -0.03, 0);
    return { s, sh, el, hand };
  });
  const legs = [-1, 1].map(s => {
    const hip = new THREE.Group(); hip.position.set(0, 0.62, s * 0.12); hip.rotation.order = 'ZYX'; body.add(hip);
    addBox(hip, 0.18, 0.3, 0.18, skin, 0, -0.15, 0);
    const knee = new THREE.Group(); knee.position.set(0, -0.3, 0); hip.add(knee);
    addBox(knee, 0.08, 0.13, 0.15, pad, 0.08, 0, 0);                       // knee pad
    addBox(knee, 0.16, 0.25, 0.16, skin, 0, -0.125, 0);
    addBox(knee, 0.26, 0.07, 0.18, skin, 0.04, -0.285, 0);                 // foot
    return { s, hip, knee };
  });

  // weapons stick out of the front (+x) of the fist
  const t = { kind, g, body, head, tails, arms, legs };
  if (weapon === 'katana') for (const a of arms) {
    addBox(a.hand, 0.16, 0.04, 0.04, mat('#1d2b6b'), 0.02, -0.03, 0);      // wrapped grip
    addBox(a.hand, 0.02, 0.08, 0.09, mat('#c9a24a'), 0.1, -0.03, 0);       // guard
    addBox(a.hand, 0.72, 0.045, 0.012, steel, 0.47, -0.03, 0);
  }
  if (weapon === 'sai') for (const a of arms) {
    addBox(a.hand, 0.14, 0.035, 0.035, mat('#7a2020'), 0, -0.03, 0);
    addBox(a.hand, 0.02, 0.025, 0.16, steel, 0.08, -0.03, 0);
    for (const s of [-1, 1]) addBox(a.hand, 0.07, 0.022, 0.022, steel, 0.11, -0.03, s * 0.08); // side prongs
    addBox(a.hand, 0.42, 0.028, 0.028, steel, 0.3, -0.03, 0);
  }
  if (weapon === 'nunchucks') {
    const wood = mat('#6b3a1a');
    addBox(arms[1].hand, 0.24, 0.04, 0.04, wood, 0.08, -0.03, 0);
    t.spin = new THREE.Group(); t.spin.position.set(0.21, -0.03, 0); arms[1].hand.add(t.spin);
    addBox(t.spin, 0.012, 0.05, 0.012, mat('#999'), 0, 0.025, 0);           // chain
    addBox(t.spin, 0.04, 0.24, 0.04, wood, 0, 0.17, 0);
    // and a slice in the other hand
    const slice = new THREE.Group(); slice.position.set(0.05, -0.05, 0); arms[0].hand.add(slice);
    addBox(slice, 0.2, 0.014, 0.13, mat('#e8b04a'), 0.1, 0, 0);
    addBox(slice, 0.035, 0.024, 0.14, mat('#c78a3a'), 0.01, 0.004, 0);      // crust
    addBox(slice, 0.035, 0.008, 0.035, mat('#b8322a'), 0.09, 0.01, 0.03);
    addBox(slice, 0.035, 0.008, 0.035, mat('#b8322a'), 0.15, 0.01, -0.02);
  }
  if (weapon === 'bo') {
    t.staff = new THREE.Group(); t.staff.position.set(0.45, 1.0, 0); body.add(t.staff);
    addBox(t.staff, 0.045, 0.045, 1.8, mat('#7a5a34'), 0, 0, 0);
    for (const z of [-0.6, 0.6]) addBox(t.staff, 0.055, 0.055, 0.12, wrap, 0, 0, z);
  }

  t.bubble = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, depthWrite: false, fog: false }));
  t.bubble.position.set(0, 1.95, 0); t.bubble.scale.set(1.6, 0.6, 1); t.bubble.visible = false;
  g.add(t.bubble);
  return t;
}

// A pose is 16 numbers: body drop, lean, left arm [forward, out, elbow], right arm, left leg
// [forward, out, knee], right leg, extra yaw, head tilt.
export function applyPose(t, p) {
  t.body.position.y = p[0]; t.body.rotation.z = p[1];
  t.arms.forEach((a, k) => { a.sh.rotation.set(-a.s * p[3 + k * 3], 0, p[2 + k * 3]); a.el.rotation.z = p[4 + k * 3]; });
  t.legs.forEach((l, k) => { l.hip.rotation.set(-l.s * p[9 + k * 3], 0, p[8 + k * 3]); l.knee.rotation.z = p[10 + k * 3]; });
}

// what each of them gets up to when nobody's visiting
export function idlePose(kind, t) {
  if (kind === 'blue') {
    // katana kata: alternating slashes from a low stance
    const s = Math.sin(t * 2.4);
    return [-0.05, -0.05, 1.3 + 1.1 * s, 0.25, 0.35, 1.3 - 1.1 * s, 0.25, 0.35,
      0.3, 0.22, -0.35, -0.25, 0.22, -0.3, 0.35 * Math.sin(t * 1.2), 0];
  }
  if (kind === 'red') {
    // working the punching bag: left, right, left...
    const u = (t * 2.6) % 2, jl = Math.max(0, Math.sin(Math.PI * u)), jr = Math.max(0, Math.sin(Math.PI * (u - 1)));
    const arm = j => [0.55 + 0.95 * j, 0.1 - 0.15 * j, 1.9 - 1.8 * j];
    return [-0.03, -0.08, ...arm(jl), ...arm(jr), 0.25, 0.1, -0.15, -0.2, 0.1, -0.2, 0.2 * (jl - jr), 0.1];
  }
  if (kind === 'purple') {
    // twirling the bo staff in front of him
    return [-0.02, 0, 1.25, -0.12, 0.3, 1.25, -0.12, 0.3, 0.12, 0.15, -0.1, -0.12, 0.15, -0.1, 0, 0.05 * Math.sin(t * 3)];
  }
  // orange: on the couch, munching pizza, feet kicking to the music
  const e = Math.max(0, Math.sin(t * 1.2)) ** 2;
  return [-0.01, 0.12, 0.5 + 0.9 * e, 0.1, 0.4 + 1.6 * e, 0.3, 0.25, 0.6,
    1.57, 0.12, -1.45 + 0.15 * Math.sin(t * 5.5), 1.57, 0.12, -1.45 + 0.15 * Math.sin(t * 5.5 + Math.PI),
    0, 0.06 * Math.sin(t * 5.5)];
}

// arms in the air, bouncing on the spot
export function cheerPose(t, o) {
  const hop = Math.abs(Math.sin(t * 5.2 + o)), wave = Math.sin(t * 10 + o);
  return [hop * 0.2, 0, 2.7 + 0.25 * wave, 0.35, 0.25, 2.7 - 0.25 * wave, 0.35, 0.25,
    0.15 * hop, 0.08, -0.35 * hop, -0.1 * hop, 0.08, -0.35 * hop, 0, 0.15];
}
