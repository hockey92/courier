// Rats: sniffing, scurrying and scattering, plus the rat you drive in rat mode.
import * as THREE from 'three';
import { GRAVITY, Z_MAX, Z_MIN } from './config.js';
import { state } from './state.js';
import { scene } from './scene.js';
import { addBox, mat } from './materials.js';
import { boxesNear, openManholeAt } from './world.js';
import { music } from './music.js';
import { dust } from './effects.js';
import { gangsters, man } from './actors.js';
import { CHANNEL_FLOOR, SEWER_Y, atLadder, biteTurtle, dropIn, sewer, startClimb, stepTransition } from './sewer.js';

// ---------- Rats: sniff around by the walls and curbs, scatter when anyone comes close ----------
export const RAT_COUNT = 9, RAT_RANGE = 20;
export const RAT_LANES = [-4.95, -2.35, 3.55, 5.8]; // building wall, back curb, front curb, front edge
export const rats = [];
export let squeakCooldown = 0;

export function placeRat(r, x) {
  r.x = x;
  r.z = Math.random() < 0.75
    ? RAT_LANES[Math.floor(Math.random() * RAT_LANES.length)] + (Math.random() - 0.5) * 0.3
    : Z_MIN + Math.random() * (Z_MAX - Z_MIN);
  r.heading = Math.random() < 0.5 ? 0 : Math.PI;
  r.state = 'idle'; r.timer = Math.random() * 120; r.speed = 0;
}

export function buildRat(pizza) {
  const g = new THREE.Group();
  const fur = mat(['#6b625a', '#5a524c', '#7a6f62'][Math.floor(Math.random() * 3)]);
  const pink = mat('#d99a9a'), black = mat('#111');
  addBox(g, 0.22, 0.09, 0.1, fur, 0, 0.07, 0);                          // body
  addBox(g, 0.12, 0.07, 0.09, fur, -0.07, 0.075, 0);                    // haunches
  const head = new THREE.Group(); head.position.set(0.12, 0.075, 0); g.add(head);
  addBox(head, 0.08, 0.07, 0.075, fur, 0.03, 0, 0);
  addBox(head, 0.05, 0.045, 0.05, fur, 0.085, -0.008, 0);               // snout
  addBox(head, 0.015, 0.015, 0.02, pink, 0.115, -0.004, 0);             // nose
  for (const s of [-1, 1]) {
    addBox(head, 0.012, 0.03, 0.03, pink, 0.01, 0.045, s * 0.03);       // ears
    addBox(head, 0.012, 0.012, 0.012, black, 0.055, 0.015, s * 0.035);  // eyes
  }
  if (pizza) {
    // Pizza Rat, dragging a slice home
    const slice = new THREE.Group(); slice.position.set(0.16, -0.035, 0.03); slice.rotation.y = 0.5; head.add(slice);
    addBox(slice, 0.16, 0.012, 0.11, mat('#e8b04a'), 0.06, 0, 0);
    addBox(slice, 0.03, 0.02, 0.12, mat('#c78a3a'), 0.14, 0.004, 0);     // crust
    addBox(slice, 0.03, 0.006, 0.03, mat('#b8322a'), 0.04, 0.008, 0.02); // pepperoni
    addBox(slice, 0.03, 0.006, 0.03, mat('#b8322a'), 0.09, 0.008, -0.025);
  }
  const legs = [];
  for (const dx of [0.07, -0.07]) for (const dz of [-0.045, 0.045]) {
    const leg = new THREE.Group(); leg.position.set(dx, 0.05, dz); g.add(leg);
    addBox(leg, 0.03, 0.05, 0.025, pink, 0, -0.025, 0);
    legs.push(leg);
  }
  // tail: a chain of segments, each hinged on the one before
  const tail = [];
  let parent = g, px = -0.13, py = 0.06;
  for (let k = 0; k < 5; k++) {
    const seg = new THREE.Group(); seg.position.set(px, py, 0); parent.add(seg);
    addBox(seg, 0.055, 0.016 - k * 0.002, 0.016 - k * 0.002, pink, -0.0275, 0, 0);
    seg.rotation.z = k === 0 ? 0.35 : -0.08;
    tail.push(seg);
    parent = seg; px = -0.055; py = 0;
  }
  scene.add(g);
  return { g, head, legs, tail, phase: Math.random() * 6 };
}

for (let i = 0; i < RAT_COUNT; i++) {
  const r = buildRat(i === 0);
  placeRat(r, (Math.random() - 0.5) * RAT_RANGE * 2);
  rats.push(r);
}

// the rat you play: steer, scurry, hop up onto low things and bite ankles
export function driveRat(r) {
  if (r.hole || r.climb) { stepTransition(r); return; }
  const { turn, go, hop, bite } = r.input;
  // paddling through the sludge is slower
  const wet = r.inSewer && r.y < SEWER_Y - 0.2;
  r.heading += turn * 0.07;
  const want = (go > 0 ? 0.075 : go < 0 ? -0.03 : 0) * (wet ? 0.5 : 1);
  r.speed += (want - r.speed) * 0.25;
  r.x += Math.cos(r.heading) * r.speed;
  r.z += Math.sin(r.heading) * r.speed;
  if (!r.inSewer) r.z = Math.max(-5.05, Math.min(Z_MAX + 1.2, r.z));

  // obstacles block from the side unless it's up on top of them
  const rad = 0.08;
  let floor = r.inSewer ? SEWER_Y + CHANNEL_FLOOR : 0;
  for (const o of r.inSewer ? sewer.boxes : boxesNear(r.x, 2)) {
    if (r.x > o.x0 - rad && r.x < o.x1 + rad && r.z > o.z0 - rad && r.z < o.z1 + rad) {
      if (r.y >= o.top - 0.05) { floor = Math.max(floor, o.top); continue; }
      const pen = [r.x - (o.x0 - rad), o.x1 + rad - r.x, r.z - (o.z0 - rad), o.z1 + rad - r.z];
      const m = pen.indexOf(Math.min(...pen));
      if (m === 0) r.x = o.x0 - rad; else if (m === 1) r.x = o.x1 + rad;
      else if (m === 2) r.z = o.z0 - rad; else r.z = o.z1 + rad;
    }
  }
  if (r.onGround && r.y > floor + 0.01) { r.onGround = false; r.vy = 0; }
  if (hop && r.onGround) {
    if (r.inSewer && atLadder(r)) { startClimb(r); return; }
    r.vy = 0.11; r.onGround = false;
  }
  if (!r.onGround) {
    r.vy -= GRAVITY;
    r.y += r.vy;
    if (r.vy <= 0 && r.y <= floor) {
      // a long drop or a splash into the sludge
      if (r.vy < -0.15 || (r.inSewer && floor < SEWER_Y - 0.2)) { dust(r.x, r.y, r.z, 6); music.plop(); }
      r.y = floor; r.vy = 0; r.onGround = true;
    }
  } else r.y = floor;
  if (!r.inSewer && r.onGround && r.y < 0.02) {
    const m = openManholeAt(r.x, r.z);
    if (m) { dropIn(r, m); return; }
  }

  if (r.biteCooldown > 0) r.biteCooldown--;
  if (r.biteT > 0) r.biteT--;
  if (bite && r.biteCooldown <= 0) {
    r.biteCooldown = 30; r.biteT = 8;
    music.squeak();
    const sx = r.x + Math.cos(r.heading) * 0.25, sz = r.z + Math.sin(r.heading) * 0.25;
    if (r.inSewer) { biteTurtle(sx, sz); return; }
    for (const g of gangsters) {
      if (!g.alive || r.y > 0.6) continue;
      const dx = g.pts.hip.x - sx, dz = g.pts.hip.z - sz, d = Math.hypot(dx, dz);
      if (d > 0.55) continue;
      g.stagger(d > 1e-4 ? dx / d : 1, d > 1e-4 ? dz / d : 0, 0.7);
      dust(sx, 0.05, sz, 5);
    }
  }
}

export function animateRat(r) {
  // scampering legs, body bob, sniffing nose, swishing tail, a lunge when biting
  r.phase += 0.15 + Math.abs(r.speed) * 9;
  const run = Math.min(1, Math.abs(r.speed) / 0.03);
  r.g.position.set(r.x, (r.y || 0) + Math.abs(Math.sin(r.phase)) * 0.015 * run, r.z);
  r.g.rotation.y = -r.heading;
  r.g.rotation.z = r.climb ? Math.PI / 2 : 0; // nose up the ladder
  r.legs.forEach((leg, k) => { leg.rotation.z = Math.sin(r.phase + (k === 0 || k === 3 ? 0 : Math.PI)) * 0.8 * run; });
  r.head.position.x = 0.12 + (r.biteT > 0 ? 0.05 : 0);
  r.head.rotation.z = r.biteT > 0 ? -0.25 : run < 0.3 ? 0.15 + Math.sin(r.phase * 3) * 0.08 : 0;
  r.head.rotation.y = run < 0.3 && !r.biteT ? Math.sin(r.phase * 0.4) * 0.5 : 0;
  r.tail.forEach((seg, k) => { if (k) seg.rotation.y = Math.sin(r.phase * (run ? 1 : 0.3) - k * 0.8) * (0.15 + 0.15 * run); });
}

export function updateRats() {
  if (squeakCooldown > 0) squeakCooldown--;
  const people = [man, ...gangsters];
  for (const r of rats) {
    if (r === state.ratPlayer) { driveRat(r); animateRat(r); continue; }
    // anyone coming close sends it running the other way
    let threat = null, td = 1.8;
    for (const p of people) {
      const d = Math.hypot(p.pts.hip.x - r.x, p.pts.hip.z - r.z);
      if (d < td) { threat = p; td = d; }
    }
    if (threat) {
      if (r.state !== 'flee' && squeakCooldown === 0 && Math.abs(r.x - state.camX) < 12) { music.squeak(); squeakCooldown = 20; }
      r.state = 'flee'; r.timer = 40 + Math.random() * 30;
      r.target = Math.atan2(r.z - threat.pts.hip.z, r.x - threat.pts.hip.x) + (Math.random() - 0.5) * 0.8;
    } else if (--r.timer <= 0) {
      if (r.state !== 'idle' && Math.random() < 0.5) { r.state = 'idle'; r.timer = 40 + Math.random() * 110; }
      else {
        // scurry, mostly along the street
        r.state = 'wander'; r.timer = 30 + Math.random() * 60;
        r.target = (Math.random() < 0.5 ? 0 : Math.PI) + (Math.random() - 0.5) * 0.9;
      }
    }
    const want = r.state === 'flee' ? 0.085 : r.state === 'wander' ? 0.028 : 0;
    r.speed += (want - r.speed) * 0.25;
    if (r.state !== 'idle') {
      let diff = r.target - r.heading;
      diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      r.heading += diff * 0.3;
    }
    r.x += Math.cos(r.heading) * r.speed;
    r.z += Math.sin(r.heading) * r.speed;
    // stay on the street, turning back at the wall and the far edge
    if (r.z < -5.05 || r.z > Z_MAX + 1.2) {
      r.z = Math.max(-5.05, Math.min(Z_MAX + 1.2, r.z));
      r.heading = r.target = -r.heading;
    }
    // squeeze round obstacles instead of through them
    for (const o of boxesNear(r.x, 2)) {
      const rad = 0.08;
      if (r.x > o.x0 - rad && r.x < o.x1 + rad && r.z > o.z0 - rad && r.z < o.z1 + rad) {
        const pen = [r.x - (o.x0 - rad), o.x1 + rad - r.x, r.z - (o.z0 - rad), o.z1 + rad - r.z];
        const m = pen.indexOf(Math.min(...pen));
        if (m === 0) r.x = o.x0 - rad; else if (m === 1) r.x = o.x1 + rad;
        else if (m === 2) r.z = o.z0 - rad; else r.z = o.z1 + rad;
      }
    }
    if (r.x < state.camX - RAT_RANGE) placeRat(r, state.camX + RAT_RANGE - Math.random() * 3);
    else if (r.x > state.camX + RAT_RANGE) placeRat(r, state.camX - RAT_RANGE + Math.random() * 3);
    animateRat(r);
  }
}
