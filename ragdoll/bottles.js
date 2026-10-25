// Bottles the throwers lob at you: a small pool flying on an arc and smashing on whatever they hit.
import * as THREE from 'three';
import { state } from './state.js';
import { scene } from './scene.js';
import { addBox, mat } from './materials.js';
import { boxesNear } from './world.js';
import { music } from './music.js';
import { dust } from './effects.js';
import { man } from './actors.js';

export const BOTTLE_G = 0.004, BOTTLE_SPEED = 0.15;
export const bottles = [];
for (let i = 0; i < 6; i++) {
  const m = new THREE.Group();
  const glass = mat('#2f7a3c', { emissive: 0x0a2a12, roughness: 0.3 });
  addBox(m, 0.08, 0.18, 0.08, glass, 0, 0, 0);
  addBox(m, 0.035, 0.08, 0.035, glass, 0, 0.13, 0);                   // neck
  addBox(m, 0.082, 0.07, 0.082, mat('#e9dfc2'), 0, 0, 0, false);      // label
  m.visible = false; scene.add(m);
  bottles.push({ m, live: false, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, spin: 0, age: 0 });
}

// thrown from the gangster's throwing hand so it lands where the target will be in a moment
export function throwBottle(g, target) {
  const b = bottles.find(b => !b.live);
  if (!b) return;
  const h = g.pts[g.punchHand];
  const T = Math.max(20, Math.hypot(target.x - h.x, target.z - h.z) / BOTTLE_SPEED);
  const tx = target.x + target.vx * T * 0.5, tz = target.z + target.vz * T * 0.5;
  Object.assign(b, { x: h.x, y: h.y, z: h.z, vx: (tx - h.x) / T, vz: (tz - h.z) / T, live: true, spin: 0, age: 0 });
  b.vy = (target.y + 1 - h.y + 0.5 * BOTTLE_G * T * T) / T;
  b.m.visible = true;
}

export function smash(b) {
  b.live = false; b.m.visible = false;
  dust(b.x, Math.max(0, b.y - 0.05), b.z, 7);
  if (Math.abs(b.x - state.camX) < 30) music.clink();
}

// onHit(nx, nz) is called when a bottle catches him, with the direction it was flying
export function updateBottles(onHit) {
  for (const b of bottles) {
    if (!b.live) continue;
    b.vy -= BOTTLE_G;
    b.x += b.vx; b.y += b.vy; b.z += b.vz;
    b.spin += 0.35; b.age++;
    const P = man.pts;
    const cx = (P.hip.x + P.neck.x) / 2, cy = (P.hip.y + P.neck.y) / 2, cz = (P.hip.z + P.neck.z) / 2;
    if (man.alive && Math.hypot(b.x - cx, (b.y - cy) * 0.6, b.z - cz) < 0.35) {
      const d = Math.hypot(b.vx, b.vz) || 1;
      onHit(b.vx / d, b.vz / d);
      smash(b);
      continue;
    }
    const inBox = boxesNear(b.x, 2).some(o => b.x > o.x0 && b.x < o.x1 && b.z > o.z0 && b.z < o.z1 && b.y < o.top);
    if (b.y < 0.05 || inBox || b.age > 240) smash(b);
  }
}

export function renderBottles() {
  for (const b of bottles) {
    if (!b.live) continue;
    b.m.position.set(b.x, b.y, b.z);
    b.m.rotation.set(0, Math.atan2(-b.vz, b.vx), b.spin);
  }
}

export function clearBottles() {
  for (const b of bottles) { b.live = false; b.m.visible = false; }
}
