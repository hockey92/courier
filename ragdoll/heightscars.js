// Cars he can use on the 3D maps (Brooklyn Heights, Lower Manhattan): any parked car, any car in the street
// traffic (out you get, driver), or one he's left somewhere. E gets in and out; W/S drive and reverse, A/D steer,
// Shift floors it, H honks. It climbs curbs and the hills, stops dead against walls and other cars, and runs
// gangsters over. What it bumps into and stands on is the map's (arena.js).
import * as THREE from 'three';
import { say, state } from './state.js';
import { gangsters, man } from './actors.js';
import { hitByCar } from './combat.js';
import { music } from './music.js';
import { arena } from './arena.js';

const boxesNear = (x, r, z) => arena.boxesNear(x, r, z), floorAt = (x, z, y) => arena.floorAt(x, z, y);
const inSolid = (x, y, z) => arena.inSolid(x, y, z);

const HALF_L = 2.2, HALF_W = 0.9;
const CLIMB = 0.25;        // curbs and the hills' steps it drives up; anything taller stops it
const REACH = 3.2;         // how close he has to be to get in
const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// traffic: the street cars, each { box, taken, color }; pose(car) → { x, y, z, heading, speed } where it is now;
// trafficMesh(car), what it looks like once he's taken it (a sedan in its colour if not given); movers: the
// map's list of moving boxes; parked: { x, y, z, ry, color, box } cars at the curb; props: { carGeo, carMat,
// parked } (streetkit.js's buildProps)
export function createCars({ traffic, pose, place, movers, parked, props, trafficMesh }) {
  const mine = [];      // cars he's driven: { x, y, z, heading, speed, vy, mesh, box }
  let driving = null;

  function keepBox(c) {
    // the car's footprint, square to the axes like every other box
    const ch = Math.abs(Math.cos(c.heading)), sh = Math.abs(Math.sin(c.heading));
    const hx = ch * HALF_L + sh * HALF_W, hz = sh * HALF_L + ch * HALF_W;
    Object.assign(c.box, { x0: c.x - hx, x1: c.x + hx, z0: c.z - hz, z1: c.z + hz, top: c.y + 1.5 });
    c.mesh.position.set(c.x, c.y, c.z);
    c.mesh.rotation.set(0, -c.heading, 0);
  }
  const sedan = color => {
    const m = props.carMat.clone();
    m.color.set(color);
    const mesh = new THREE.Mesh(props.carGeo, m);
    mesh.castShadow = mesh.receiveShadow = true;
    return mesh;
  };
  function makeCar(x, y, z, heading, mesh, speed = 0) {
    props.parked.parent.add(mesh);
    const c = { x, y, z, heading, speed, vy: 0, mesh, box: { x0: 0, x1: 0, z0: 0, z1: 0, top: 0 } };
    movers.push(c.box);
    keepBox(c);
    mine.push(c);
    return c;
  }

  // the nearest car he could get into: { kind: 'mine' | 'parked' | 'traffic', it, x, z }
  function nearest() {
    let best = null, bestD = REACH;
    const consider = (kind, it, x, y, z) => {
      const d = Math.hypot(x - man.x, z - man.z);
      if (d < bestD && Math.abs(y - man.y) < 1.6) { best = { kind, it, x, z }; bestD = d; }
    };
    for (const c of mine) consider('mine', c, c.x, c.y, c.z);
    for (const p of parked) if (!p.taken) consider('parked', p, p.x, p.y, p.z);
    for (const c of traffic) {
      if (!c.box || c.taken) continue;
      const p = pose(c);
      consider('traffic', c, p.x, p.y, p.z);
    }
    return best;
  }

  function enter(n) {
    let c;
    if (n.kind === 'mine') c = n.it;
    else if (n.kind === 'parked') {
      const p = n.it;
      p.taken = true; p.box.top = -1e9;
      props.parked.setMatrixAt(parked.indexOf(p), ZERO);
      props.parked.instanceMatrix.needsUpdate = true;
      c = makeCar(p.x, p.y, p.z, -p.ry, sedan(p.color));
    } else {
      // a carjacking: the driver's gone, the car's his
      const t = n.it, p = pose(t);
      t.taken = true; t.box.top = -1e9;
      c = makeCar(p.x, p.y, p.z, p.heading, trafficMesh ? trafficMesh(t) : sedan(t.color), p.speed);
    }
    driving = c;
    c.vy = 0;
    say('Behind the wheel', 'W / S drive · A / D steer · Shift floors it · H honks · E gets out', 150);
  }

  function exit() {
    const c = driving, h = c.heading;
    // out of whichever door has room, else over the bonnet
    const spots = [[-Math.sin(h), Math.cos(h), 1.9], [Math.sin(h), -Math.cos(h), 1.9], [Math.cos(h), Math.sin(h), 3.2], [-Math.cos(h), -Math.sin(h), 3.2]];
    let out = null;
    for (const [dx, dz, r] of spots) {
      const x = c.x + dx * r, z = c.z + dz * r, y = floorAt(x, z, c.y + 0.3);
      if (Math.abs(y - c.y) < 1 && !inSolid(x, y + 0.5, z) && !inSolid(x, y + 1.5, z)) { out = [x, z, y]; break; }
    }
    if (!out) out = [c.x, c.z, c.box.top];
    c.speed = 0;
    driving = null;
    place(man, out[0], out[1], out[2], h);
    man.invuln = 30;
  }

  // would the car at (x, z) be inside something it can't drive up onto?
  function blocked(c, x, z) {
    const ch = Math.cos(c.heading), sh = Math.sin(c.heading);
    for (const [u, v] of [[HALF_L, HALF_W], [HALF_L, -HALF_W], [-HALF_L, HALF_W], [-HALF_L, -HALF_W], [HALF_L, 0], [-HALF_L, 0], [0, HALF_W], [0, -HALF_W]]) {
      const px = x + ch * u - sh * v, pz = z + sh * u + ch * v;
      for (const b of boxesNear(px, 0.05, pz)) {
        if (b === c.box || b.top <= c.y + CLIMB) continue;
        if (b.bottom !== undefined && c.y + 1.6 <= b.bottom) continue;
        if (px > b.x0 && px < b.x1 && pz > b.z0 && pz < b.z1) return true;
      }
    }
    return false;
  }

  // one 60 Hz step of driving: throttle and steer are -1…1
  function drive(throttle, steer, boost) {
    const c = driving;
    if (throttle > 0) c.speed += c.speed < 0 ? 0.02 : 0.0075 * (boost ? 1.6 : 1);
    else if (throttle < 0) c.speed -= c.speed > 0 ? 0.02 : 0.005;
    else c.speed *= 0.985;
    c.speed = clamp(c.speed, -0.14, boost ? 0.62 : 0.4);
    if (!throttle && Math.abs(c.speed) < 0.003) c.speed = 0;
    // tight enough at walking pace to pull out of a parking space
    c.heading += steer * 0.04 * clamp(c.speed / 0.05, -1, 1);
    // in short steps, so a thin railing still stops it
    const n = Math.ceil(Math.abs(c.speed) / 0.15) || 1;
    for (let k = 0; k < n; k++) {
      const nx = c.x + Math.cos(c.heading) * c.speed / n, nz = c.z + Math.sin(c.heading) * c.speed / n;
      if (blocked(c, nx, nz)) {
        if (Math.abs(c.speed) > 0.12) { state.shake = Math.max(state.shake, Math.abs(c.speed) * 0.5); music.smash(true); }
        c.speed *= -0.25;
        break;
      }
      c.x = nx; c.z = nz;
    }
    // down off curbs and hills with a bit of gravity, straight up onto them
    const floor = floorAt(c.x, c.z, c.y);
    if (c.y > floor + 0.01) { c.vy -= 0.012; c.y = Math.max(floor, c.y + c.vy); }
    else { c.y = floor; c.vy = 0; }
    // anyone in front of the bumper at speed gets run over
    const ch = Math.cos(c.heading), sh = Math.sin(c.heading);
    for (const g of gangsters) {
      if (g.carHitT > 0) { g.carHitT--; continue; }
      if (!g.alive || Math.abs(c.speed) < 0.06 || Math.abs(g.y - c.y) > 1.5) continue;
      const dx = g.x - c.x, dz = g.z - c.z, u = dx * ch + dz * sh, v = -dx * sh + dz * ch;
      if (Math.abs(u) > HALF_L + 0.3 || Math.abs(v) > HALF_W + 0.3) continue;
      const s = Math.sign(c.speed);
      hitByCar(g, ch * s, sh * s);
      g.carHitT = 45;
      c.speed *= 0.8;
      music.smash(true);
    }
    keepBox(c);
    // he rides along, out of harm's way, where the gangsters can still see him
    place(man, c.x, c.z, c.y);
    man.invuln = Math.max(man.invuln, 2);
  }

  return {
    get driving() { return driving; },
    mine,
    nearest,
    // E: in the nearest car, or out of this one; false if there's no car to get into
    use() {
      if (driving) { exit(); return true; }
      const n = nearest();
      if (!n || !man.alive) return false;
      enter(n);
      return true;
    },
    drive,
    honk() { music.honk(); },
  };
}
