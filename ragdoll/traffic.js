// Traffic: taxis and cars driving both ways down the street, kept in a loop around the camera.
// They brake and honk for anyone in their lane but still hit whoever steps out too late, can be
// jumped on (and ridden for a bit), and block people, bottles and litter like any other box.
import * as THREE from 'three';
import { state } from './state.js';
import { scene } from './scene.js';
import { addBox, mat } from './materials.js';
import { music } from './music.js';

// eastbound (+x) keeps to the front lane, westbound to the back lane; the strip between stays clear
export const LANES = [{ z: 2.1, dir: 1 }, { z: -0.9, dir: -1 }];
export const CAR_LEN = 3.6, CAR_W = 1.7, CAR_TOP = 0.85, CABIN_TOP = 1.43;
const RANGE = 80, PER_LANE = 3, DECEL = 0.008, ACCEL = 0.0025;
const COLORS = ['taxi', 'taxi', 'taxi', '#b8322f', '#2f56b8', '#dedad0', '#2a2a30', '#3f7a52'];

export const cars = [];

function buildCar(color) {
  const g = new THREE.Group();
  const taxi = color === 'taxi';
  const paint = mat(taxi ? '#f2c230' : color);
  addBox(g, CAR_LEN, 0.6, CAR_W, paint, 0, 0.55, 0);
  addBox(g, 3.0, 0.08, CAR_W + 0.02, mat(taxi ? '#222' : '#55555c'), 0, 0.62, 0);
  addBox(g, 1.96, 0.5, 1.46, mat('#9fc7e8', { emissive: 0x223344 }), -0.2, 1.1, 0);
  addBox(g, 2.04, 0.08, 1.52, paint, -0.2, 1.39, 0);
  if (taxi) addBox(g, 0.5, 0.18, 0.22, mat('#fff', { emissive: 0x555544 }), -0.2, 1.52, 0);
  for (const dx of [-1.15, 1.15]) for (const dz of [-0.75, 0.75]) addBox(g, 0.6, 0.55, 0.3, mat('#111'), dx, 0.28, dz);
  for (const dz of [-0.55, 0.55]) {
    addBox(g, 0.04, 0.14, 0.3, mat('#fff6c0', { emissive: 0xfff0a0 }), 1.8, 0.65, dz, false);
    addBox(g, 0.04, 0.14, 0.3, mat('#d33', { emissive: 0x880000 }), -1.8, 0.65, dz, false);
  }
  scene.add(g);
  return g;
}

function placeCar(c, x) {
  c.x = x;
  c.cruise = 0.09 + Math.random() * 0.07;
  c.v = c.cruise;
  c.g.position.set(c.x, 0, c.lane.z);
  c.g.rotation.y = c.lane.dir > 0 ? 0 : Math.PI;
  updateBoxes(c);
}

function updateBoxes(c) {
  const [body, cabin] = c.boxes, z = c.lane.z;
  Object.assign(body, { x0: c.x - CAR_LEN / 2, x1: c.x + CAR_LEN / 2, z0: z - CAR_W / 2, z1: z + CAR_W / 2, top: CAR_TOP });
  const cx = c.x - 0.2 * c.lane.dir;
  Object.assign(cabin, { x0: cx - 1, x1: cx + 1, z0: z - 0.75, z1: z + 0.75, top: CABIN_TOP });
}

for (const lane of LANES) {
  for (let i = 0; i < PER_LANE; i++) {
    const c = { lane, g: buildCar(COLORS[Math.floor(Math.random() * COLORS.length)]), boxes: [{}, {}], honkT: 0 };
    placeCar(c, -RANGE + (i + Math.random() * 0.6) * (2 * RANGE / PER_LANE));
    cars.push(c);
  }
}

// collision boxes of the cars near x, for boxesNear()
export function carBoxesNear(x, range) {
  const out = [];
  for (const c of cars) if (Math.abs(c.x - x) < range + CAR_LEN) out.push(...c.boxes);
  return out;
}

// how far ahead (from the front bumper) the nearest thing in this car's lane is
function clearAhead(c, bodies) {
  let gap = Infinity;
  const front = c.x + c.lane.dir * CAR_LEN / 2;
  for (const o of cars) {
    if (o === c || o.lane !== c.lane) continue;
    const d = (o.x - c.x) * c.lane.dir - CAR_LEN;
    if (d > -CAR_LEN && d < gap) gap = d;
  }
  let person = false;
  for (const b of bodies) {
    const h = b.pts.hip;
    if (h.y > CAR_TOP + 0.4 || Math.abs(h.z - c.lane.z) > CAR_W / 2 + 0.5) continue;
    const d = (h.x - front) * c.lane.dir;
    if (d > -0.3 && d < gap) { gap = d; person = true; }
  }
  return { gap, person };
}

// bodies: everyone who can be run over; onHit(body, nx, nz) when a car plows into someone standing
export function updateTraffic(bodies, onHit) {
  for (const b of bodies) if (b.carCd > 0) b.carCd--;
  for (const c of cars) {
    const { gap, person } = clearAhead(c, bodies);
    const stopping = 1.2 + c.v * c.v / (2 * DECEL) + c.v * 6;
    if (gap < stopping) {
      c.v = Math.max(0, c.v - DECEL);
      if (person && c.honkT <= 0 && Math.abs(c.x - state.camX) < 25) { music.honk(); c.honkT = 100; }
    } else {
      c.v = Math.min(c.cruise, c.v + ACCEL);
    }
    if (c.honkT > 0) c.honkT--;
    const dx = c.v * c.lane.dir;
    c.x += dx;

    for (const b of bodies) {
      if (!b.alive) continue;
      const inX = Math.abs(b.x - c.x) < CAR_LEN / 2 + 0.25, inZ = Math.abs(b.z - c.lane.z) < CAR_W / 2 + 0.25;
      if (!inX || !inZ) continue;
      // riding on the roof or the hood: carried along
      if (b.onGround && b.y >= CAR_TOP - 0.05) { b.x += dx; continue; }
      if (b.y < CAR_TOP - 0.1 && c.v > 0.035 && !(b.carCd > 0)) {
        // knocked forwards and off to whichever side of the car they were on
        const side = Math.sign(b.z - c.lane.z) || 1;
        onHit(b, c.lane.dir * 0.8, side * 0.6);
        b.carCd = 60;
        c.v *= 0.5;
      }
    }

    // keep the loop of traffic around the camera, re-entering where the next car in the lane won't be on top
    const lo = state.camX - RANGE, hi = state.camX + RANGE;
    if (c.x < lo || c.x > hi) {
      let x = Math.max(lo + 0.5, Math.min(hi - 0.5, c.x < lo ? c.x + 2 * RANGE : c.x - 2 * RANGE));
      const inward = x < state.camX ? 1 : -1;
      while (cars.some(o => o !== c && o.lane === c.lane && Math.abs(o.x - x) < CAR_LEN * 3)) x += inward * CAR_LEN * 3;
      placeCar(c, x);
    }
    c.g.position.x = c.x;
    updateBoxes(c);
  }
}
