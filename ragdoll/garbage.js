// Flying litter, blown around by gusty wind and kicked up by anyone running through it.
import * as THREE from 'three';
import { GRAVITY, Z_MAX, Z_MIN } from './config.js';
import { state } from './state.js';
import { scene } from './scene.js';
import { boxGeo } from './materials.js';
import { boxesNear } from './world.js';
import { gangsters, man } from './actors.js';

// ---------- Flying garbage, blown around by gusty wind ----------
export const GARBAGE_TYPES = [
  // size, colour, count, how much the wind pushes it, how much it flutters, how fast it falls
  { size: [0.3, 0.01, 0.22], color: '#ebe7da', count: 35, catch: 1.0, flutter: 1.0, weight: 0.6 },  // paper
  { size: [0.4, 0.012, 0.3], color: '#c9c4b8', count: 20, catch: 0.9, flutter: 0.8, weight: 0.7 },   // newspaper
  { size: [0.24, 0.18, 0.2], color: '#f4f4f4', count: 15, catch: 1.2, flutter: 1.4, weight: 0.35, opacity: 0.8 }, // plastic bag
  { size: [0.07, 0.12, 0.07], color: '#c0392b', count: 15, catch: 0.35, flutter: 0.1, weight: 1.6, metal: true },  // soda can
  { size: [0.08, 0.11, 0.08], color: '#ffffff', count: 12, catch: 0.6, flutter: 0.3, weight: 1.0 },  // paper cup
  { size: [0.32, 0.02, 0.26], color: '#a57a4c', count: 15, catch: 0.7, flutter: 0.5, weight: 0.9 },  // cardboard
  { size: [0.12, 0.008, 0.08], color: '#e3c03a', count: 25, catch: 1.1, flutter: 1.2, weight: 0.5 }, // candy wrapper
];
export const GARBAGE_RANGE = 32;
export const garbage = [];
export const _obj = new THREE.Object3D();
for (const type of GARBAGE_TYPES) {
  const m = new THREE.MeshStandardMaterial({
    color: type.color, roughness: type.metal ? 0.35 : 0.9, metalness: type.metal ? 0.6 : 0,
    side: THREE.DoubleSide, transparent: !!type.opacity, opacity: type.opacity || 1, flatShading: true,
  });
  type.mesh = new THREE.InstancedMesh(boxGeo(...type.size), m, type.count);
  type.mesh.castShadow = true;
  type.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  type.mesh.frustumCulled = false;
  scene.add(type.mesh);
  for (let i = 0; i < type.count; i++) {
    const p = {
      type, i,
      x: (Math.random() - 0.5) * GARBAGE_RANGE * 2, y: Math.random() < 0.5 ? 0.02 : 0.3 + Math.random() * 6,
      z: Z_MIN - 0.3 + Math.random() * (Z_MAX - Z_MIN + 1.5),
      vx: 0, vy: 0, vz: 0, rx: Math.random() * 6, ry: Math.random() * 6, rz: Math.random() * 6,
      sx: 0, sy: 0, sz: 0, seed: Math.random() * 100,
    };
    garbage.push(p);
  }
}

export let windT = 0;
export const wind = { x: 0, z: 0, gust: 0 };
export function updateWind() {
  windT += 1 / 60;
  // a steady breeze down the street that swings round now and then, plus gusts
  const dir = Math.sin(windT * 0.05) > -0.3 ? 1 : -1;
  wind.gust = Math.max(0, Math.sin(windT * 0.7) * Math.sin(windT * 0.23 + 1) * 1.6);
  wind.x = dir * (0.03 + wind.gust * 0.06) * (0.8 + 0.2 * Math.sin(windT * 2.1));
  wind.z = Math.sin(windT * 0.37) * 0.015 * (1 + wind.gust);
}

export function updateGarbage() {
  updateWind();
  const kickers = [man, ...gangsters];
  for (const p of garbage) {
    const t = p.type;
    const onGround = p.y <= 0.03;
    const grip = onGround ? 0.015 : 0.04;
    p.vx += (wind.x - p.vx) * grip * t.catch;
    p.vz += (wind.z - p.vz) * grip * t.catch;
    p.vy -= GRAVITY * 0.12 * t.weight;
    if (!onGround) {
      // flutter: light things bob and drift as they fall
      p.vy += Math.sin(windT * 6 + p.seed) * 0.0025 * t.flutter;
      p.vy *= 0.97;
    } else if (wind.gust > 0.6 && Math.random() < 0.02 * t.catch) {
      p.vy = (0.04 + Math.random() * 0.06) * t.catch; // a gust lifts it off the street
    }
    // anyone running through the litter kicks it up
    for (const k of kickers) {
      const dx = p.x - k.pts.footL.x, dz = p.z - k.pts.footL.z;
      if (p.y < 0.8 && dx * dx + dz * dz < 0.3 && (Math.abs(k.vx) + Math.abs(k.vz) > 0.03 || !k.alive)) {
        p.vx += k.vx * 0.6 + (Math.random() - 0.5) * 0.04;
        p.vz += k.vz * 0.6 + (Math.random() - 0.5) * 0.04;
        p.vy = Math.max(p.vy, 0.04 + Math.random() * 0.05);
      }
    }
    p.x += p.vx; p.y += p.vy; p.z += p.vz;

    let floor = 0;
    for (const b of boxesNear(p.x, 2)) {
      if (p.x > b.x0 && p.x < b.x1 && p.z > b.z0 && p.z < b.z1 && p.y < b.top + 0.1 && p.y > b.top - 0.3) floor = Math.max(floor, b.top);
    }
    if (p.y < floor + 0.02) {
      p.y = floor + 0.02;
      if (p.vy < 0) p.vy = 0;
      p.vx *= 0.9; p.vz *= 0.9;
    }

    // tumble faster the faster it's moving; things lying flat stop spinning
    const sp = Math.hypot(p.vx, p.vy, p.vz);
    const spin = p.y <= floor + 0.03 ? 0.2 : 1;
    p.rx += (p.vz * 4 + sp * 3 * Math.sin(p.seed)) * spin * t.flutter;
    p.ry += sp * 2 * spin;
    p.rz += (-p.vx * 4 + sp * 3 * Math.cos(p.seed)) * spin * t.flutter;
    if (p.y <= floor + 0.03 && t.size[1] < 0.05) { p.rx *= 0.85; p.rz *= 0.85; } // sheets lie flat

    // keep a cloud of litter around the camera: wrap pieces that drift too far
    if (p.x < state.camX - GARBAGE_RANGE) { p.x += GARBAGE_RANGE * 2; p.y = Math.random() * 5; }
    else if (p.x > state.camX + GARBAGE_RANGE) { p.x -= GARBAGE_RANGE * 2; p.y = Math.random() * 5; }
    if (p.z < Z_MIN - 0.5) { p.z = Z_MIN - 0.5; p.vz = Math.abs(p.vz) * 0.5; }
    if (p.z > Z_MAX + 1.5) { p.z = Z_MAX + 1.5; p.vz = -Math.abs(p.vz) * 0.5; }
    if (p.y > 12) p.vy = -0.01;
  }
}

export function renderGarbage() {
  for (const p of garbage) {
    _obj.position.set(p.x, p.y, p.z);
    _obj.rotation.set(p.rx, p.ry, p.rz);
    _obj.updateMatrix();
    p.type.mesh.setMatrixAt(p.i, _obj.matrix);
  }
  for (const t of GARBAGE_TYPES) t.mesh.instanceMatrix.needsUpdate = true;
}
