// Fixed gear bikes he can ride on the 3D maps, locked up at racks around the neighbourhood, or lying where he
// left them. E gets on and off. He rides in plain sight, posed on the saddle, the bullhorns and the pedals, and the
// cranks are fixed to the back wheel: his legs turn whenever it rolls, backwards too. W pedals, S backpedals (a
// skid at speed, rolling backwards from a stop), A/D steer, Shift stands up and sprints, Space bunny hops, H rings
// the bell. He stops against walls (and goes over the bars if he's quick), knocks over anyone in front of the
// wheel, and a punch knocks him off.
import * as THREE from 'three';
import { GRAVITY, HIP_W, NECK, SH_W, THIGH, TORSO, UARM } from './config.js';
import { addBox, limb, mat } from './materials.js';
import { say, state } from './state.js';
import { dust } from './effects.js';
import { gangsters, man } from './actors.js';
import { hitByCar } from './combat.js';
import { music } from './music.js';
import { arena } from './arena.js';

const boxesNear = (x, r, z) => arena.boxesNear(x, r, z), floorAt = (x, z, y) => arena.floorAt(x, z, y);
const inSolid = (x, y, z) => arena.inSolid(x, y, z);

// the bike's own frame: u forward, y up, l to his left (the game's +side); the origin is on the ground under the
// bottom bracket
const R = 0.34;                                   // 700c wheels
const BB = [0, 0.29], REAR = [-0.39, R], FRONT = [0.59, R];
const SEAT = [-0.146, 0.8], HEAD_TOP = [0.49, 0.8], HEAD_BOT = [0.53, 0.66];
const CRANK = 0.17, GEAR = 48 / 17;               // the back wheel turns 2.8 times for each turn of the cranks
const SADDLE = [-0.17, 0.895];                    // his hip, sitting
const BARS = [0.69, 0.91];                        // his hands, on the bullhorns' tips
const PIVOT = 0.51;                               // the front end turns about here
const CLIMB = 0.25;                               // curbs and the hills' steps it rides up
const REACH = 2.2;                                // how close he has to be to get on
const TOP_SPEED = 0.24, SPRINT = 0.34;
// points round the bike that mustn't go into anything: the tyres, the bar ends, the frame
const PROBES = [[0.93, 0], [-0.73, 0], [0.72, 0.22], [0.72, -0.22], [0.1, 0]];
const COLORS = [
  ['#7fd1b9', '#f2f1ec'], ['#1f2023', '#e84a8a'], ['#e8742a', '#1c1c1e'], ['#efeee9', '#e8c547'],
  ['#c8302f', '#f2f1ec'], ['#2f6fb5', '#f29a2e'], ['#3d4d3a', '#d9c7a0'], ['#f2c230', '#1c1c1e'],
];
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

const tireGeo = new THREE.TorusGeometry(R - 0.017, 0.017, 6, 28);
const rimGeo = new THREE.RingGeometry(R - 0.1, R - 0.032, 28, 1);    // deep-V rims
const hubGeo = new THREE.CylinderGeometry(0.025, 0.025, 0.09, 8).rotateX(Math.PI / 2);
const ringGeo = new THREE.CylinderGeometry(0.1, 0.1, 0.008, 20).rotateX(Math.PI / 2);
const cogGeo = new THREE.CylinderGeometry(0.036, 0.036, 0.01, 12).rotateX(Math.PI / 2);

function wheel(parent, x, y, rim, black, steel) {
  const w = new THREE.Group();
  w.position.set(x, y, 0);
  w.add(new THREE.Mesh(tireGeo, black), new THREE.Mesh(hubGeo, steel));
  for (const z of [-0.012, 0.012]) { const m = new THREE.Mesh(rimGeo, rim); m.position.z = z; w.add(m); }
  for (let k = 0; k < 4; k++) addBox(w, 0.006, 2 * (R - 0.095), 0.006, steel, 0, 0, 0).rotation.z = k * Math.PI / 4;
  parent.add(w);
  return w;
}

function buildBike(color, rimColor) {
  const g = new THREE.Group();
  const frame = mat(color), black = mat('#1b1b1d'), steel = mat('#b9bcc2', { metalness: 0.6, roughness: 0.4 });
  const rim = mat(rimColor, { side: THREE.DoubleSide }), tape = mat(rimColor);
  const tube = (p, a, b, w, m = frame, l = 0) => limb(p, [a[0], a[1], l], [b[0], b[1], l], w, m);
  tube(g, SEAT, HEAD_TOP, 0.034);                 // top tube, dead level like a track frame's
  tube(g, BB, HEAD_BOT, 0.042);                   // down tube
  tube(g, BB, SEAT, 0.036);                       // seat tube
  tube(g, HEAD_BOT, HEAD_TOP, 0.046);             // head tube
  for (const l of [-0.055, 0.055]) {
    tube(g, BB, REAR, 0.022, frame, l);           // chainstays
    tube(g, SEAT, REAR, 0.02, frame, l);          // seatstays
  }
  tube(g, SEAT, [-0.165, 0.85], 0.026, steel);    // seatpost
  const saddle = mat('#3a2a20');
  addBox(g, 0.15, 0.05, 0.14, saddle, -0.235, 0.868, 0);
  addBox(g, 0.15, 0.04, 0.06, saddle, -0.1, 0.868, 0);
  // the drive side, on his right: chainring, the one fixed cog, the chain between them
  const chainring = new THREE.Mesh(ringGeo, steel);
  chainring.position.set(BB[0], BB[1], -0.062);
  const cog = new THREE.Mesh(cogGeo, steel);
  cog.position.set(REAR[0], REAR[1], -0.062);
  g.add(chainring, cog);
  tube(g, [BB[0], BB[1] + 0.1], [REAR[0], REAR[1] + 0.036], 0.012, black, -0.062);
  tube(g, [BB[0], BB[1] - 0.1], [REAR[0], REAR[1] - 0.036], 0.012, black, -0.062);
  const rear = wheel(g, REAR[0], REAR[1], rim, black, steel);
  // cranks: the right one points along the crank angle, the left one opposite
  const cranks = new THREE.Group();
  cranks.position.set(BB[0], BB[1], 0);
  limb(cranks, [0, 0, -0.078], [0, -CRANK, -0.078], 0.024, steel);
  limb(cranks, [0, 0, 0.078], [0, CRANK, 0.078], 0.024, steel);
  addBox(cranks, 0.03, 0.03, 0.16, steel, 0, 0, 0);
  g.add(cranks);
  const pedals = [0, 1].map(() => addBox(g, 0.1, 0.022, 0.09, black, 0, 0, 0));
  // the front end turns about a line through the head tube: fork, wheel, stem and bullhorns
  const front = new THREE.Group();
  front.position.x = PIVOT;
  const f = ([u, y]) => [u - PIVOT, y];
  for (const l of [-0.045, 0.045]) tube(front, f(HEAD_BOT), f(FRONT), 0.024, frame, l);
  tube(front, f(HEAD_TOP), [HEAD_TOP[0] + 0.01 - PIVOT, 0.86], 0.03, steel);
  tube(front, [HEAD_TOP[0] + 0.01 - PIVOT, 0.86], [0.58 - PIVOT, 0.87], 0.03, steel);
  addBox(front, 0.035, 0.035, 0.42, black, 0.58 - PIVOT, 0.87, 0);
  for (const l of [-0.2, 0.2]) tube(front, [0.58 - PIVOT, 0.87], [0.73 - PIVOT, 0.93], 0.034, tape, l);
  const fw = wheel(front, FRONT[0] - PIVOT, FRONT[1], rim, black, steel);
  g.add(front);
  g.traverse(m => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } });
  return { g, rear, fw, front, cranks, pedals };
}

// an NYC "hoop" bike rack, the bike locked up along its left side
function buildRack(parent, x, y, z, heading) {
  const r = new THREE.Group();
  r.position.set(x, y, z);
  r.rotation.y = -heading;
  const m = mat('#2a2c30', { metalness: 0.5, roughness: 0.5 });
  for (const u of [-0.36, 0.36]) addBox(r, 0.05, 0.86, 0.05, m, u, 0.43, -0.32);
  addBox(r, 0.77, 0.05, 0.05, m, 0, 0.86, -0.32);
  parent.add(r);
}

// the joint between a and b when both bones are len long, bent towards the hint (hx, hy, hz)
function bend(a, b, len, hx, hy, hz, out) {
  const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2], d = Math.hypot(dx, dy, dz) || 1e-6;
  const dot = (hx * dx + hy * dy + hz * dz) / d;
  let px = hx - dot * dx / d, py = hy - dot * dy / d, pz = hz - dot * dz / d;
  const pl = Math.hypot(px, py, pz) || 1e-6, h = Math.sqrt(Math.max(0, len * len - d * d / 4)) / pl;
  out[0] = a[0] + dx / 2 + px * h; out[1] = a[1] + dy / 2 + py * h; out[2] = a[2] + dz / 2 + pz * h;
}

// racks: [x, y, z, heading] spots for a locked-up bike each; place(ragdoll, x, z, y, heading) moves him
export function createBikes({ parent, racks, place }) {
  const bikes = racks.map(([x, y, z, heading], i) => {
    buildRack(parent, x, y, z, heading);
    const [color, rim] = COLORS[i % COLORS.length];
    const b = {
      x, y, z, heading, speed: 0, vy: 0, air: false, roll: 0, steer: 0, rearA: 0, frontA: 0, crank: Math.random() * 6,
      skidding: false, braking: false, skid: 0, stand: 0, still: 0, down: 0, racked: true, t: 0, ...buildBike(color, rim),
    };
    parent.add(b.g);
    return b;
  });
  let riding = null, told = false;

  // skid marks: a ring of flat black strips laid behind the back wheel
  const MARKS = 160;
  const marks = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 0.05).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: 0x151515, transparent: true, opacity: 0.75, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }), MARKS);
  marks.frustumCulled = false;
  const markObj = new THREE.Object3D();
  markObj.scale.set(0, 0, 0); markObj.updateMatrix();
  for (let k = 0; k < MARKS; k++) marks.setMatrixAt(k, markObj.matrix);
  parent.add(marks);
  let markIdx = 0, lastMark = null;
  function layMark(b) {
    const x = b.x + Math.cos(b.heading) * REAR[0], z = b.z + Math.sin(b.heading) * REAR[0], y = b.y + 0.012;
    if (lastMark) {
      const dx = x - lastMark[0], dz = z - lastMark[2], d = Math.hypot(dx, dz);
      if (d < 0.05) return;
      markObj.position.set((x + lastMark[0]) / 2, y, (z + lastMark[2]) / 2);
      markObj.rotation.set(0, -Math.atan2(dz, dx), 0);
      markObj.scale.set(d + 0.02, 1, 1);
      markObj.updateMatrix();
      marks.setMatrixAt(markIdx, markObj.matrix);
      marks.instanceMatrix.needsUpdate = true;
      markIdx = (markIdx + 1) % MARKS;
    }
    lastMark = [x, y, z];
  }

  // would the bike at (x, z) be inside something it can't ride up onto?
  function blocked(b, x, z) {
    const ch = Math.cos(b.heading), sh = Math.sin(b.heading);
    for (const [u, l] of PROBES) {
      const px = x + ch * u - sh * l, pz = z + sh * u + ch * l;
      for (const o of boxesNear(px, 0.05, pz)) {
        if (o.top <= b.y + CLIMB) continue;
        if (o.bottom !== undefined && b.y + 1.8 <= o.bottom) continue;
        if (px > o.x0 && px < o.x1 && pz > o.z0 && pz < o.z1) return true;
      }
    }
    return false;
  }
  // rolls it along by its speed in short steps; true if it ran into something
  function roll(b) {
    const n = Math.ceil(Math.abs(b.speed) / 0.12) || 1, ch = Math.cos(b.heading), sh = Math.sin(b.heading);
    for (let k = 0; k < n; k++) {
      const nx = b.x + ch * b.speed / n, nz = b.z + sh * b.speed / n;
      if (blocked(b, nx, nz)) return true;
      b.x = nx; b.z = nz;
    }
    return false;
  }
  // down off curbs with a bit of gravity, straight up onto them; true on the frame it lands
  function fall(b) {
    const floor = floorAt(b.x, b.z, b.y);
    if (b.air || b.y > floor + 0.01) {
      b.air = true;
      b.vy -= GRAVITY;
      b.y += b.vy;
      if (b.vy <= 0 && b.y <= floor) { const hard = b.vy < -0.07; b.y = floor; b.vy = 0; b.air = false; return hard; }
    } else { b.y = floor; b.vy = 0; }
    return false;
  }
  // the wheels and the cranks turn with the road, unless the back wheel's locked in a skid
  function spin(b) {
    b.frontA += b.speed / R;
    if (!b.skidding) { b.rearA += b.speed / R; b.crank += b.speed / R / GEAR; }
  }

  // the nearest bike he could get on: { bike, d }
  function nearest() {
    let best = null;
    for (const b of bikes) {
      if (b === riding) continue;
      const d = Math.hypot(b.x - man.x, b.z - man.z);
      if (d < REACH && Math.abs(b.y - man.y) < 1.2 && (!best || d < best.d)) best = { bike: b, d };
    }
    return best;
  }

  function getOn(b) {
    riding = b;
    Object.assign(b, { racked: false, down: 0, roll: 0, speed: 0, vy: 0, air: false, skidding: false, braking: false });
    man.cancelAttacks();
    Object.assign(man, { spin: 0, sweep: 0, twist: 0 });
    lastMark = null;
    say(told ? 'Fixed gear' : 'Fixed gear: no brakes, no coasting',
      'W pedal · S backpedal (skid it) · A / D steer · Shift stand and sprint · Space hop · H bell · E off', told ? 90 : 220);
    told = true;
  }
  // off to whichever side has room, laying the bike down
  function getOff() {
    const b = riding, h = b.heading;
    let out = [b.x, b.z, b.y];
    for (const s of [1, -1]) {
      const x = b.x - Math.sin(h) * 0.7 * s, z = b.z + Math.cos(h) * 0.7 * s, y = floorAt(x, z, b.y + 0.3);
      if (Math.abs(y - b.y) < 1 && !inSolid(x, y + 0.5, z) && !inSolid(x, y + 1.5, z)) { out = [x, z, y]; break; }
    }
    riding = null;
    b.speed = 0;
    place(man, out[0], out[1], out[2], h);
  }
  // thrown off the bike: he goes on with its speed, out cold for a moment (unless he's already down for good)
  function throwOff(nx, nz, frames, power) {
    const b = riding, ch = Math.cos(b.heading), sh = Math.sin(b.heading);
    riding = null;
    for (const q of Object.values(man.pts)) { q.px -= ch * b.speed; q.pz -= sh * b.speed; q.py -= Math.max(0, b.vy); }
    if (man.alive) man.knockOut(nx, nz, frames, power);
    Object.assign(man, { stun: 0, vx: 0, vz: 0, vy: 0, tilt: 0 });
    b.speed *= 0.4;
  }

  // where his joints go, in the bike's frame (scratch arrays, filled in by pose())
  const Q = {};
  for (const n of ['head', 'neck', 'hip', 'kneeL', 'footL', 'kneeR', 'footR', 'elbowL', 'handL', 'elbowR', 'handR']) Q[n] = [0, 0, 0];
  const from = [0, 0, 0];
  // sat on the saddle (or up out of it), hands on the bullhorns, feet on the pedals; then leaned with the bike
  function pose(b) {
    const st = b.stand, lean = 0.75 + 0.15 * st + 0.12 * b.skid;
    const { hip, neck, head } = Q;
    hip[0] = SADDLE[0] + 0.13 * st; hip[1] = SADDLE[1] + 0.1 * st;
    neck[0] = hip[0] + Math.sin(lean) * TORSO; neck[1] = hip[1] + Math.cos(lean) * TORSO;
    head[0] = neck[0] + Math.sin(lean * 0.4) * NECK; head[1] = neck[1] + Math.cos(lean * 0.4) * NECK;
    for (const s of [1, -1]) {
      // the right crank is at the crank angle, the left half a turn round; the ball of the foot on the pedal
      const a = b.crank + (s > 0 ? Math.PI : 0), foot = Q[s > 0 ? 'footL' : 'footR'];
      foot[0] = -CRANK * Math.sin(a) - 0.03; foot[1] = BB[1] - CRANK * Math.cos(a) + 0.055; foot[2] = s * 0.11;
      from[0] = hip[0]; from[1] = hip[1]; from[2] = s * HIP_W;
      bend(from, foot, THIGH, 1, 0, s * 0.15, Q[s > 0 ? 'kneeL' : 'kneeR']);
      // the bars turn with the front end
      const hand = Q[s > 0 ? 'handL' : 'handR'], c = Math.cos(b.steer), sn = Math.sin(b.steer), du = BARS[0] - PIVOT;
      hand[0] = PIVOT + du * c - s * SH_W * sn; hand[1] = BARS[1]; hand[2] = du * sn + s * SH_W * c;
      from[0] = neck[0]; from[1] = neck[1]; from[2] = s * SH_W;
      bend(from, hand, UARM, -0.3, -1, s * 0.5, Q[s > 0 ? 'elbowL' : 'elbowR']);
    }
    const cr = Math.cos(b.roll), sr = Math.sin(b.roll), ch = Math.cos(b.heading), sh = Math.sin(b.heading);
    for (const n in Q) {
      const [u, y, l] = Q[n], y2 = y * cr - l * sr, l2 = y * sr + l * cr, q = man.pts[n];
      q.x = q.px = b.x + ch * u - sh * l2;
      q.y = q.py = b.y + y2;
      q.z = q.pz = b.z + sh * u + ch * l2;
    }
    Object.assign(man, { x: b.x, y: b.y, z: b.z, heading: b.heading, vx: 0, vz: 0, vy: 0, onGround: true, tilt: -b.roll });
  }

  // one 60 Hz step of riding: pedal and steer are -1…1
  function ride(pedal, steer, sprint, hop) {
    const b = riding;
    b.t++;
    // a punch (or getting busted) knocks him off
    if (!man.alive || man.stun > 0) {
      const d = Math.hypot(man.vx, man.vz);
      throwOff(d > 1e-4 ? man.vx / d : Math.cos(b.heading), d > 1e-4 ? man.vz / d : Math.sin(b.heading), 50, 1);
      return;
    }
    const v = Math.abs(b.speed), top = sprint ? SPRINT : TOP_SPEED;
    // no freewheel: pushing on the pedals speeds it up, resisting them slows it, and from a stop it backs up
    b.braking = pedal < 0 && (b.braking || b.speed > 0.07);
    b.skidding = b.braking && b.speed > 0 && !b.air;
    if (!b.air) {
      if (pedal > 0) b.speed += b.speed < 0 ? 0.01 : b.speed < top ? (sprint ? 0.005 : 0.0035) : (top - b.speed) * 0.03;
      else if (b.skidding) b.speed = Math.max(0, b.speed - 0.0055);
      else if (pedal < 0 && !b.braking) b.speed = Math.max(-0.06, b.speed - 0.003);
      else { b.speed *= 0.994; if (Math.abs(b.speed) < 0.002) b.speed = 0; }
    }
    // tight at walking pace, wide at full tilt; a skid swings the back end round a bit more
    b.heading += steer * 0.055 * Math.min(1, v / 0.03) / (1 + v * 5) * Math.sign(b.speed || 1) * (b.skidding ? 1.4 : 1);
    if (hop && !b.air && b.vy === 0) { b.vy = 0.085; b.air = true; dust(b.x, b.y, b.z, 5); music.whoosh(); }
    const ch = Math.cos(b.heading), sh = Math.sin(b.heading);
    if (roll(b)) {
      if (b.speed > 0.14) {
        // over the bars
        music.smash(true);
        state.shake = Math.max(state.shake, 0.25);
        say('Wipeout!', '', 80);
        throwOff(ch, sh, 55, 1 + b.speed * 3);
        b.speed = -0.04;
        return;
      }
      if (v > 0.05) { music.bonk(); state.shake = Math.max(state.shake, v * 0.6); }
      b.speed *= -0.2;
    }
    if (fall(b)) { dust(b.x, b.y, b.z, 8); music.plop(); }
    spin(b);
    if (b.skidding) {
      layMark(b);
      if (b.t % 6 === 0) music.skid();
      if (b.t % 4 === 0) dust(b.x + ch * REAR[0], b.y, b.z + sh * REAR[0], 1);
    } else lastMark = null;
    // anyone in front of the wheel at speed goes flying
    for (const g of gangsters) {
      if (g.bikeHitT > 0) { g.bikeHitT--; continue; }
      if (!g.alive || b.speed < 0.1 || Math.abs(g.y - b.y) > 1.2) continue;
      const dx = g.x - b.x, dz = g.z - b.z, u = dx * ch + dz * sh, l = -dx * sh + dz * ch;
      if (u < 0.2 || u > 1.2 || Math.abs(l) > 0.5) continue;
      hitByCar(g, ch, sh);
      g.bikeHitT = 45;
      b.speed *= 0.55;
      music.bonk();
    }
    // stopped with his feet on the pedals: a track stand, front wheel turned, balancing
    b.still += ((v < 0.004 && !pedal && !b.air ? 1 : 0) - b.still) * 0.05;
    const standTo = sprint && pedal > 0 ? 1 : b.skidding ? 0.6 : b.still * 0.6;
    b.stand += (standTo - b.stand) * 0.12;
    b.skid += ((b.skidding ? 1 : 0) - b.skid) * 0.2;
    // leaning into the turn; rocking under him when he sprints; wobbling in a track stand
    const rollTo = steer * Math.min(0.42, v * 2.2) * Math.sign(b.speed || 1) + Math.sin(b.crank) * 0.09 * b.stand * (1 - b.still)
      + b.still * 0.05 * Math.sin(b.t * 0.05);
    b.roll += (rollTo - b.roll) * 0.12;
    const steerTo = steer * (0.12 + 0.3 * (1 - Math.min(1, v / 0.08))) + b.still * (0.45 + 0.05 * Math.sin(b.t * 0.031));
    b.steer += (steerTo - b.steer) * 0.15;
    pose(b);
  }

  // every 60 Hz step: the bikes nobody's riding slide to a stop and fall over (the ones at racks stay up)
  function update() {
    for (const b of bikes) {
      if (b === riding) continue;
      if (b.speed) {
        if (roll(b)) b.speed *= -0.3;
        b.skidding = false;
        spin(b);
        b.speed *= 0.9;
        if (Math.abs(b.speed) < 0.002) b.speed = 0;
      }
      if (b.air || !b.racked) fall(b);
      b.roll *= 0.8; b.steer *= 0.9; b.stand = b.skid = b.still = 0;
      b.down += ((b.racked ? 0 : 1) - b.down) * 0.12;
    }
  }

  function render() {
    for (const b of bikes) {
      const near = Math.hypot(b.x - man.x, b.z - man.z) < 160;
      b.g.visible = near;
      if (!near) continue;
      // lying down: on its left side, resting on the bar end and the pedal
      b.g.position.set(b.x, b.y + b.down * 0.05, b.z);
      b.g.rotation.set(b.roll + b.down * 1.35, -b.heading, 0, 'YXZ');
      b.rear.rotation.z = -b.rearA;
      b.fw.rotation.z = -b.frontA;
      b.cranks.rotation.z = -b.crank;
      b.front.rotation.y = -b.steer;
      b.pedals.forEach((p, i) => {
        const a = b.crank + (i ? Math.PI : 0);
        p.position.set(-CRANK * Math.sin(a), BB[1] - CRANK * Math.cos(a), i ? 0.12 : -0.12);
      });
    }
  }

  return {
    bikes,
    get riding() { return riding; },
    nearest,
    // E: on the nearest bike, or off this one; false if there's no bike to get on
    use() {
      if (riding) { getOff(); return true; }
      const n = nearest();
      if (!n || !man.alive) return false;
      getOn(n.bike);
      return true;
    },
    ride,
    update,
    render,
    bell() { music.bell(); },
  };
}
