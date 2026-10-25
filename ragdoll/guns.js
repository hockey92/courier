// The AK-47: its box model, firing where he's aiming (hitscan, no aim assist), the laser sight, tracers,
// muzzle flash, brass and recoil, and tossing it away when the magazine runs dry. Picking it up and
// putting it down is in weapons.js.
import * as THREE from 'three';
import { GRAVITY } from './config.js';
import { say, state } from './state.js';
import { scene } from './scene.js';
import { addBox, boxGeo, glowMat, mat, orient } from './materials.js';
import { boxesNear } from './world.js';
import { dust } from './effects.js';
import { music } from './music.js';
import { gangsters, man } from './actors.js';
import { hurtGangster } from './combat.js';

// frames between shots (10 a second), how far a bullet carries (m)
export const FIRE_GAP = 6, RANGE = 30;
export const MUZZLE = { x: 0.71, y: 0.045 };

// built along +x (the barrel) with y up; the origin is the pistol grip, where the right hand holds it
export function buildAk() {
  const g = new THREE.Group();
  const steel = mat('#2a2c30', { roughness: 0.5 }), wood = mat('#8c4a22'), dark = mat('#17181b');
  addBox(g, 0.30, 0.07, 0.05, steel, 0.08, 0.04, 0);                       // receiver
  addBox(g, 0.27, 0.02, 0.044, steel, 0.075, 0.085, 0);                    // dust cover
  addBox(g, 0.03, 0.015, 0.03, steel, 0.245, 0.09, 0);                     // rear sight
  addBox(g, 0.30, 0.055, 0.04, wood, -0.21, 0.02, 0).rotation.z = 0.12;    // stock
  addBox(g, 0.03, 0.12, 0.045, wood, -0.36, 0, 0).rotation.z = 0.12;       // butt
  addBox(g, 0.04, 0.1, 0.035, wood, -0.005, -0.035, 0).rotation.z = -0.3;  // pistol grip
  addBox(g, 0.07, 0.012, 0.015, steel, 0.05, -0.03, 0);                    // trigger guard
  // the curved magazine
  addBox(g, 0.065, 0.08, 0.032, steel, 0.13, -0.025, 0).rotation.z = 0.12;
  addBox(g, 0.065, 0.08, 0.032, steel, 0.15, -0.095, 0).rotation.z = 0.32;
  addBox(g, 0.065, 0.08, 0.032, steel, 0.18, -0.16, 0).rotation.z = 0.52;
  addBox(g, 0.2, 0.055, 0.052, wood, 0.33, 0.035, 0);                      // handguard
  addBox(g, 0.15, 0.03, 0.04, wood, 0.305, 0.088, 0);                      // upper handguard
  addBox(g, 0.05, 0.018, 0.018, steel, 0.415, 0.09, 0);                    // gas tube
  addBox(g, 0.03, 0.05, 0.03, steel, 0.45, 0.07, 0);                       // gas block
  addBox(g, 0.26, 0.022, 0.022, steel, 0.54, 0.045, 0);                    // barrel
  addBox(g, 0.02, 0.05, 0.016, steel, 0.6, 0.075, 0);                      // front sight
  addBox(g, 0.04, 0.03, 0.03, dark, 0.685, 0.045, 0);                      // muzzle brake
  scene.add(g);
  return g;
}

// the one in his hands, with its muzzle flash
export const held = buildAk();
held.visible = false;
export const flash = new THREE.Group();
{
  const fire = new THREE.MeshBasicMaterial({ color: 0xffd36b });
  addBox(flash, 0.16, 0.05, 0.05, fire, 0.08, 0, 0, false);
  addBox(flash, 0.04, 0.14, 0.02, fire, 0.03, 0, 0, false);
  addBox(flash, 0.04, 0.02, 0.14, fire, 0.03, 0, 0, false);
  const glow = new THREE.Sprite(glowMat);
  glow.scale.setScalar(0.6);
  flash.add(glow);
}
flash.position.set(MUZZLE.x, MUZZLE.y, 0);
flash.visible = false;
held.add(flash);
export const muzzleLight = new THREE.PointLight(0xffc070, 0, 7, 1.5);
scene.add(muzzleLight);

// the laser sight: a faint red line from the muzzle to wherever a shot would stop, and a dot there
export const laser = new THREE.Mesh(boxGeo(0.014, 1, 0.014),
  new THREE.MeshBasicMaterial({ color: 0xff2a2a, transparent: true, opacity: 0.7, depthWrite: false, fog: false }));
export const laserDot = new THREE.Mesh(boxGeo(0.08, 0.08, 0.08), new THREE.MeshBasicMaterial({ color: 0xff3030, fog: false }));
laser.visible = laserDot.visible = false;
scene.add(laser, laserDot);

// the empty one he throws away
export const tossed = { t: 0, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, spin: 0, yaw: 0, mesh: buildAk() };
tossed.mesh.visible = false;

export const tracers = [];
for (let i = 0; i < 8; i++) {
  const m = new THREE.Mesh(boxGeo(0.02, 1, 0.02), new THREE.MeshBasicMaterial({ color: 0xfff0a0, transparent: true }));
  m.visible = false; scene.add(m);
  tracers.push({ m, life: 0 });
}
export let tracerIdx = 0;

export const brass = [];
for (let i = 0; i < 16; i++) {
  const m = new THREE.Mesh(boxGeo(0.014, 0.035, 0.014), mat('#d4a93a', { emissive: 0x3a2a00, roughness: 0.4 }));
  m.visible = false; scene.add(m);
  brass.push({ m, life: 0, vx: 0, vy: 0, vz: 0 });
}
export let brassIdx = 0;

export const gunState = { flashT: 0, kick: 0 };

// the gun's frame from his hands: o the grip (right hand), f down the barrel (towards the left hand),
// u up, s out to his left
export const frame = { o: new THREE.Vector3(), f: new THREE.Vector3(), u: new THREE.Vector3(), s: new THREE.Vector3() };
export const _basis = new THREE.Matrix4();
export function gunFrame() {
  const { handL, handR } = man.pts, d = man.faceDir;
  const { o, f, u, s } = frame;
  o.set(handR.x, handR.y, handR.z);
  f.set(handL.x - handR.x, handL.y - handR.y, handL.z - handR.z);
  if (f.lengthSq() < 1e-4) f.set(d.x, 0, d.z);
  f.normalize();
  s.set(-d.z, 0, d.x).addScaledVector(f, -(f.x * -d.z + f.z * d.x)).normalize();
  u.crossVectors(s, f);
  return frame;
}
export function framePoint(x, y, z = 0) {
  const { o, f, u, s } = frame;
  return { x: o.x + f.x * x + u.x * y + s.x * z, y: o.y + f.y * x + u.y * y + s.y * z, z: o.z + f.z * x + u.z * y + s.z * z };
}

export function tossGun() {
  gunFrame();
  const { o, s } = frame;
  Object.assign(tossed, { t: 100, x: o.x, y: o.y, z: o.z, vx: -s.x * 0.04, vy: 0.07, vz: -s.z * 0.04, spin: 0, yaw: -man.heading });
  man.weapon = null; man.aiming = false;
  say('Out of ammo!', 'Back to your fists', 90);
}

// how far along a flat ray (ox, oz) + t (dx, dz) it enters a collision box
function rayBox(ox, oz, dx, dz, b) {
  let t0 = 0, t1 = Infinity;
  for (const [o, d, lo, hi] of [[ox, dx, b.x0, b.x1], [oz, dz, b.z0, b.z1]]) {
    if (Math.abs(d) < 1e-9) { if (o < lo || o > hi) return Infinity; continue; }
    let a = (lo - o) / d, c = (hi - o) / d;
    if (a > c) [a, c] = [c, a];
    t0 = Math.max(t0, a); t1 = Math.min(t1, c);
    if (t0 > t1) return Infinity;
  }
  return t0;
}

// a level shot from o along (dx, dz): how far it gets before a box or a standing gangster, and who
export function trace(o, dx, dz) {
  let end = RANGE, hit = null;
  for (const b of boxesNear(o.x + dx * RANGE / 2, RANGE / 2 + 1)) {
    const t = rayBox(o.x, o.z, dx, dz, b);
    if (t < end && o.y < b.top) end = t;
  }
  for (const g of gangsters) {
    if (!g.alive || o.y < g.y + 0.1 || o.y > g.y + 2) continue;
    const rx = g.x - o.x, rz = g.z - o.z, t = rx * dx + rz * dz;
    if (t < 0 || t > end || Math.abs(rx * dz - rz * dx) > 0.3 * g.bulk) continue;
    end = t; hit = g;
  }
  return { end, hit };
}

// straight down the way he's facing (the aim sets his heading), with a little spread
function shoot() {
  gunFrame();
  const m = framePoint(MUZZLE.x, MUZZLE.y);
  const a = man.heading + (Math.random() - 0.5) * 0.03, dx = Math.cos(a), dz = Math.sin(a);
  const { end, hit } = trace(m, dx, dz);
  const ex = m.x + dx * end, ez = m.z + dz * end;
  if (hit) hurtGangster(hit, 1, 0.8, dx, dz, true);
  if (end < RANGE) dust(ex, m.y - 0.05, ez, hit ? 4 : 3);

  const tr = tracers[tracerIdx++ % tracers.length];
  orient(tr.m, m.x, m.y, m.z, ex, m.y, ez, frame.s);
  tr.m.scale.y = end;
  tr.life = 3; tr.m.visible = true;

  const p = framePoint(0.12, 0.07, -0.03), cs = brass[brassIdx++ % brass.length];
  cs.m.position.set(p.x, p.y, p.z);
  cs.vx = -frame.s.x * 0.03 + (Math.random() - 0.5) * 0.01; cs.vy = 0.035 + Math.random() * 0.015;
  cs.vz = -frame.s.z * 0.03 + (Math.random() - 0.5) * 0.01;
  cs.life = 50; cs.m.visible = true;

  // the kick: both hands jump back and the muzzle climbs, then the pose pulls them back in
  const { handL, handR } = man.pts;
  handL.x -= dx * 0.025; handL.z -= dz * 0.025; handL.y += 0.02;
  handR.x -= dx * 0.02; handR.z -= dz * 0.02;
  gunState.kick = 1; gunState.flashT = 3;
  flash.rotation.x = Math.random() * Math.PI;
  state.shake = Math.max(state.shake, 0.04);
  music.bang();
}

// w: the rifle in his hands, { ammo, cooldown }; firing: the trigger's held this frame
export function updateGun(w, firing) {
  if (w.cooldown > 0) w.cooldown--;
  if (!firing || w.cooldown > 0 || man.stun > 0) return;
  w.cooldown = FIRE_GAP;
  if (w.ammo > 0) { w.ammo--; shoot(); }
  else { music.dryFire(); tossGun(); }
}

// tracers, brass and the tossed rifle, every frame whether he's holding one or not
export function updateGunFx() {
  if (gunState.flashT > 0) gunState.flashT--;
  gunState.kick *= 0.7;
  for (const t of tracers) if (t.life > 0 && --t.life <= 0) t.m.visible = false;
  for (const c of brass) {
    if (c.life <= 0) continue;
    c.vy -= GRAVITY;
    c.m.position.x += c.vx; c.m.position.y += c.vy; c.m.position.z += c.vz;
    c.m.rotation.x += 0.5; c.m.rotation.z += 0.3;
    if (c.m.position.y < 0.01) { c.m.position.y = 0.01; c.vy *= -0.4; c.vx *= 0.5; c.vz *= 0.5; }
    if (--c.life <= 0) c.m.visible = false;
  }
  if (tossed.t > 0) {
    tossed.t--;
    tossed.vy -= GRAVITY;
    tossed.x += tossed.vx; tossed.y += tossed.vy; tossed.z += tossed.vz;
    if (tossed.y < 0.04) { tossed.y = 0.04; tossed.vy = 0; tossed.vx *= 0.6; tossed.vz *= 0.6; }
    else tossed.spin += 0.25;
  }
}

export function renderGun() {
  const armed = man.rifle;
  held.visible = armed;
  laser.visible = laserDot.visible = armed && man.alive && !state.playingRat;
  if (armed) {
    const { o, f, u, s } = gunFrame();
    held.quaternion.setFromRotationMatrix(_basis.makeBasis(f, u, s));
    held.position.copy(o).addScaledVector(f, -0.035 * gunState.kick);
  }
  if (laser.visible) {
    const m = framePoint(MUZZLE.x, MUZZLE.y), d = man.fwd, { end } = trace(m, d.x, d.z);
    const ex = m.x + d.x * end, ez = m.z + d.z * end;
    orient(laser, m.x, m.y, m.z, ex, m.y, ez, frame.s);
    laser.scale.y = end;
    laserDot.position.set(ex, m.y, ez);
  }
  flash.visible = armed && gunState.flashT > 0;
  if (flash.visible) {
    const m = framePoint(MUZZLE.x + 0.1, MUZZLE.y);
    muzzleLight.position.set(m.x, m.y, m.z);
  }
  muzzleLight.intensity = flash.visible ? 4 : 0;
  for (const tr of tracers) if (tr.life > 0) tr.m.material.opacity = tr.life / 3;

  // blinks out after lying there a moment
  tossed.mesh.visible = tossed.t > 0 && !(tossed.t < 30 && Math.floor(tossed.t / 5) % 2);
  if (tossed.t > 0) {
    tossed.mesh.position.set(tossed.x, tossed.y, tossed.z);
    tossed.mesh.rotation.set(Math.PI / 2, tossed.yaw, tossed.spin, 'YXZ');
  }
}
