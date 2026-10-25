// Picking up crates and trash cans, carrying them overhead and throwing them. A thrown one smashes on
// whatever it meets: a gangster takes the hit, a crate splinters, a trash can spills its litter.
import * as THREE from 'three';
import { GRAVITY } from './config.js';
import { scene } from './scene.js';
import { boxGeo, mat } from './materials.js';
import { PICKABLE, boxesNear, buildObstacle, pickableNear, takeObstacle } from './world.js';
import { dust } from './effects.js';
import { music } from './music.js';
import { garbage } from './garbage.js';
import { gangsters, man } from './actors.js';
import { hurtGangster } from './combat.js';

export const THROW_SPEED = 0.22, THROW_RANGE = 10;
export const flying = [];

// a crate or trash can centred on its middle, so it tumbles about its middle
function propMesh(type) {
  const holder = new THREE.Group(), inner = new THREE.Group();
  buildObstacle(inner, { type, x: 0, z: 0 });
  inner.position.y = -PICKABLE[type].h / 2;
  holder.add(inner);
  scene.add(holder);
  return holder;
}

// where the held thing sits: on top of his raised hands
function heldAt() {
  const { handL, handR } = man.pts, half = PICKABLE[man.holding.type].h / 2;
  return { x: (handL.x + handR.x) / 2, y: (handL.y + handR.y) / 2 + half - 0.05, z: (handL.z + handR.z) / 2 };
}

// the nearest standing gangster within throwing range in front of him
function aimTarget() {
  let best = null, bestD = THROW_RANGE;
  const f = man.fwd;
  for (const g of gangsters) {
    if (!g.alive) continue;
    const dx = g.x - man.x, dz = g.z - man.z, d = Math.hypot(dx, dz);
    if (d > 0.5 && d < bestD && (dx * f.x + dz * f.z) / d > 0.5) { best = g; bestD = d; }
  }
  return best;
}

// E: pick up the crate or trash can he's next to, or throw the one he's holding
export function grab() {
  if (man.holding) {
    if (man.throwT >= 0) return;
    man.throwTarget = aimTarget();
    if (man.throwTarget) man.heading = Math.atan2(man.throwTarget.z - man.z, man.throwTarget.x - man.x);
    man.startThrow();
    return;
  }
  if (!man.alive || !man.onGround || man.y > 0.1 || man.attacking || man.stun > 0) return;
  const found = pickableNear(man.x, man.z, 0.6);
  if (!found) return;
  const { o, i } = found;
  takeObstacle(o, i);
  man.heading = Math.atan2(o.z - man.z, o.x - man.x);
  man.holding = { type: o.type, mesh: propMesh(o.type) };
}

// let go of what he's holding with the given velocity
function release(vx, vy, vz) {
  const h = man.holding, p = heldAt();
  man.holding = null;
  flying.push({ type: h.type, mesh: h.mesh, ...p, vx, vy, vz, spin: 0, age: 0 });
}

function throwHeld() {
  const p = heldAt(), t = man.throwTarget;
  let dx = man.fwd.x, dz = man.fwd.z, vy = 0.07;
  if (t && t.alive) {
    // lob it so it comes down on his chest
    const tx = t.x - p.x, tz = t.z - p.z, d = Math.hypot(tx, tz) || 1, T = d / THROW_SPEED;
    dx = tx / d; dz = tz / d;
    vy = (t.y + 1.1 - p.y + 0.5 * GRAVITY * T * T) / T;
  }
  release(dx * THROW_SPEED + man.vx, vy, dz * THROW_SPEED + man.vz);
}

// ---------- Splinters and spilled litter ----------
const debris = [];
for (let i = 0; i < 24; i++) {
  const m = new THREE.Mesh(boxGeo(0.36, 0.04, 0.1), mat('#a07a4a'));
  m.visible = false; m.castShadow = true; scene.add(m);
  debris.push({ m, life: 0, vx: 0, vy: 0, vz: 0, spin: 0 });
}
let debrisIdx = 0;
function spray(x, y, z, n, geo, material) {
  for (let k = 0; k < n; k++) {
    const d = debris[debrisIdx++ % debris.length];
    d.m.geometry = geo; d.m.material = material;
    d.m.position.set(x, Math.max(0.1, y), z);
    d.m.rotation.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
    d.vx = (Math.random() - 0.5) * 0.12; d.vy = 0.04 + Math.random() * 0.08; d.vz = (Math.random() - 0.5) * 0.12;
    d.spin = (Math.random() - 0.5) * 0.4; d.life = 110; d.m.visible = true;
  }
}

function smash(p) {
  const metal = p.type === 'trash';
  dust(p.x, Math.max(0, p.y - 0.3), p.z, 14);
  music.smash(metal);
  if (metal) {
    // the lid flies off and the litter goes everywhere
    spray(p.x, p.y, p.z, 1, boxGeo(0.58, 0.08, 0.58), mat('#6d737c'));
    for (let k = 0; k < 10; k++) {
      const g = garbage[Math.floor(Math.random() * garbage.length)];
      Object.assign(g, { x: p.x, y: Math.max(0.2, p.y), z: p.z,
        vx: (Math.random() - 0.5) * 0.15, vy: 0.05 + Math.random() * 0.1, vz: (Math.random() - 0.5) * 0.15 });
    }
  } else {
    spray(p.x, p.y, p.z, 7, boxGeo(0.36, 0.04, 0.1), mat('#a07a4a'));
  }
  scene.remove(p.mesh);
}

export function updateCarry() {
  if (man.holding) {
    // a blow, a fall or getting busted makes him drop it
    if (!man.alive || man.stun > 0) release(man.vx, 0.03, man.vz);
    else if (man.throwRelease) throwHeld();
  }
  man.throwRelease = false;

  for (let i = flying.length - 1; i >= 0; i--) {
    const p = flying[i], kind = PICKABLE[p.type], half = kind.h / 2;
    p.vy -= GRAVITY;
    p.x += p.vx; p.y += p.vy; p.z += p.vz;
    p.spin += 0.2; p.age++;
    let hit = p.y - half <= 0;
    for (const g of hit ? [] : gangsters) {
      if (!g.alive || Math.hypot(g.x - p.x, g.z - p.z) > 0.6 || p.y < g.y || p.y > g.y + 1.9) continue;
      const s = Math.hypot(p.vx, p.vz) || 1;
      hurtGangster(g, kind.damage, kind.power, p.vx / s, p.vz / s);
      hit = true;
      break;
    }
    // walls, crates, cars... (not straight away, so it clears whatever he was standing by)
    if (!hit && p.age > 4) {
      for (const b of boxesNear(p.x, 3)) {
        if (p.x > b.x0 - 0.25 && p.x < b.x1 + 0.25 && p.z > b.z0 - 0.25 && p.z < b.z1 + 0.25 && p.y - half < b.top) { hit = true; break; }
      }
    }
    if (hit) { smash(p); flying.splice(i, 1); }
  }

  for (const d of debris) {
    if (d.life <= 0) continue;
    d.vy -= GRAVITY;
    d.m.position.x += d.vx; d.m.position.y += d.vy; d.m.position.z += d.vz;
    d.m.rotation.x += d.spin; d.m.rotation.z += d.spin * 0.7;
    if (d.m.position.y < 0.03) { d.m.position.y = 0.03; d.vy *= -0.3; d.vx *= 0.6; d.vz *= 0.6; d.spin *= 0.5; }
    if (--d.life <= 0) d.m.visible = false;
  }
}

export function renderCarry() {
  if (man.holding) {
    const p = heldAt();
    man.holding.mesh.position.set(p.x, p.y, p.z);
    man.holding.mesh.rotation.set(0, -man.heading, 0);
  }
  for (const p of flying) {
    p.mesh.position.set(p.x, p.y, p.z);
    // tumbling end over end along its flight
    p.mesh.rotation.set(0, -Math.atan2(p.vz, p.vx), -p.spin, 'YXZ');
  }
}
