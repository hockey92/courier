// Apples: a basket of them to throw (picked up in weapons.js). F or the left button throws one overarm
// the way he's aiming, a hand at a time. They bonk gangsters (1 damage and a stagger) and splat on
// whatever else they meet.
import * as THREE from 'three';
import { GRAVITY } from './config.js';
import { say, state } from './state.js';
import { scene } from './scene.js';
import { addBox, boxGeo, cylGeo, mat } from './materials.js';
import { arena } from './arena.js';
import { music } from './music.js';
import { gangsters, man } from './actors.js';
import { hurtGangster } from './combat.js';

// thrown at 0.3 m/frame plus his own speed, with a little lift: about 10 m before it comes down
export const APPLE_SPEED = 0.3, APPLE_LIFT = 0.05;

export function buildApple(parent = scene) {
  const g = new THREE.Group(), red = mat('#c8202a', { roughness: 0.5 });
  addBox(g, 0.085, 0.075, 0.085, red, 0, 0, 0);
  addBox(g, 0.065, 0.095, 0.065, red, 0, 0, 0);                            // rounds it off
  addBox(g, 0.012, 0.03, 0.012, mat('#5a3a1e'), 0, 0.055, 0, false);       // stem
  addBox(g, 0.032, 0.006, 0.018, mat('#3f8a2e'), 0.018, 0.062, 0, false);  // leaf
  parent.add(g);
  return g;
}

// a wicker bushel heaped with apples, standing on its base
export function buildBasket() {
  const g = new THREE.Group();
  const part = (geo, m, y) => { const c = new THREE.Mesh(geo, m); c.position.y = y; c.castShadow = true; g.add(c); };
  part(cylGeo(0.2, 0.15, 0.2), mat('#a57a44'), 0.1);                       // basket
  part(cylGeo(0.168, 0.165, 0.025), mat('#7a5530'), 0.04);                 // bands
  part(cylGeo(0.205, 0.2, 0.025), mat('#7a5530'), 0.18);
  for (let k = 0; k < 7; k++) {
    const a = k / 7 * Math.PI * 2, apple = buildApple(g);
    apple.position.set(Math.cos(a) * 0.12, 0.22, Math.sin(a) * 0.12);
    apple.rotation.y = a * 3;
  }
  buildApple(g).position.set(0, 0.27, 0);
  scene.add(g);
  return g;
}

export const heldApple = buildApple();
heldApple.visible = false;

export const thrown = [];
for (let i = 0; i < 10; i++) {
  const m = buildApple();
  m.visible = false;
  thrown.push({ m, live: false, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, spin: 0, age: 0 });
}

// bits of apple from a splat: red peel and pale flesh
export const bits = [];
for (let i = 0; i < 24; i++) {
  const m = new THREE.Mesh(boxGeo(0.035, 0.03, 0.035), mat(i % 2 ? '#c8202a' : '#f1e3ad'));
  m.visible = false; m.castShadow = true; scene.add(m);
  bits.push({ m, life: 0, vx: 0, vy: 0, vz: 0 });
}
export let bitIdx = 0;

function splat(a) {
  a.live = false; a.m.visible = false;
  for (let k = 0; k < 6; k++) {
    const b = bits[bitIdx++ % bits.length];
    b.m.position.set(a.x, Math.max(0.03, a.y), a.z);
    b.vx = (Math.random() - 0.5) * 0.08 - a.vx * 0.1; b.vy = 0.02 + Math.random() * 0.05;
    b.vz = (Math.random() - 0.5) * 0.08 - a.vz * 0.1;
    b.life = 60 + Math.random() * 30; b.m.visible = true;
  }
}

// which hand holds the next apple: the throwing hand until it lets go, then the other one (throws alternate)
function appleHand() {
  const throwing = man.punchT >= 0 && man.punchT < man.punchW + 4;
  return man.pts['hand' + (throwing ? man.punchSide : man.punchSide === 'R' ? 'L' : 'R')];
}

// w: the apples in his hands, { ammo }. The throw itself is a punch (control() makes it overarm); this
// lets the apple go as the arm comes over, instead of the fist landing
export function updateApples(w) {
  if (!man.punchHit) return;
  man.punchHit = false;
  const a = thrown.find(t => !t.live);
  if (a) {
    const h = man.pts[man.punchHand], f = man.fwd;
    Object.assign(a, { live: true, x: h.x, y: h.y, z: h.z, spin: 0, age: 0,
      vx: f.x * APPLE_SPEED + man.vx, vy: APPLE_LIFT, vz: f.z * APPLE_SPEED + man.vz });
    a.m.visible = true;
    music.whoosh();
  }
  if (--w.ammo <= 0) {
    man.weapon = null; man.aiming = false;
    say('Out of apples!', 'Back to your fists', 90);
  }
}

// the apples in the air and the bits on the ground
export function updateAppleFx() {
  for (const a of thrown) {
    if (!a.live) continue;
    a.vy -= GRAVITY;
    a.x += a.vx; a.y += a.vy; a.z += a.vz;
    a.spin += 0.3; a.age++;
    const s = Math.hypot(a.vx, a.vz) || 1;
    const g = gangsters.find(g => g.alive && Math.hypot(g.x - a.x, g.z - a.z) < 0.32 * g.bulk && a.y > g.y + 0.1 && a.y < g.y + 1.95);
    if (g) {
      hurtGangster(g, 1, 1, a.vx / s, a.vz / s);
      music.bonk();
      splat(a);
      continue;
    }
    const inBox = arena.boxesNear(a.x, 2, a.z).some(o => a.x > o.x0 && a.x < o.x1 && a.z > o.z0 && a.z < o.z1 && a.y < o.top);
    if (a.y < 0.05 || inBox || a.age > 200) {
      if (Math.abs(a.x - state.camX) < 30) music.plop();
      splat(a);
    }
  }
  for (const b of bits) {
    if (b.life <= 0) continue;
    b.vy -= GRAVITY;
    const p = b.m.position;
    p.x += b.vx; p.y += b.vy; p.z += b.vz;
    const floor = arena.floorAt(p.x, p.z, p.y) + 0.015;
    if (p.y < floor) { p.y = floor; b.vy = 0; b.vx *= 0.5; b.vz *= 0.5; }
    if (--b.life <= 0) b.m.visible = false;
  }
}

export function renderApples() {
  heldApple.visible = man.weapon?.type === 'apples' && man.alive;
  if (heldApple.visible) {
    const h = appleHand(), f = man.faceDir;
    heldApple.position.set(h.x + f.x * 0.03, h.y + 0.02, h.z + f.z * 0.03);
  }
  for (const a of thrown) {
    if (!a.live) continue;
    a.m.position.set(a.x, a.y, a.z);
    a.m.rotation.set(a.spin, Math.atan2(-a.vz, a.vx), a.spin * 0.6);
  }
}
