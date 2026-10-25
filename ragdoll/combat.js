// Gangsters: the kinds of gangster, spawning them, their fighting brains, landing punches, kicks,
// bottles and Big Tony's charge, stomps, clearing away the knocked-out ones, and getting busted.
import * as THREE from 'three';
import { BODY_R, JUMP_V, S, Z_MAX, Z_MIN } from './config.js';
import { say, state } from './state.js';
import { camera, scene } from './scene.js';
import { addBox, mat } from './materials.js';
import { boxesNear } from './world.js';
import { dust } from './effects.js';
import { Ragdoll } from './ragdoll.js';
import { GANGSTER_LOOKS } from './looks.js';
import { gangsters, man } from './actors.js';
import { clearBottles, throwBottle, updateBottles } from './bottles.js';

// speed is in S units; gap is the shortest pause between swings (the longest is twice that)
export const GANG_TYPES = {
  // the regular: punches and kicks
  thug: { name: 'Thug', hp: 3, speed: 4.8, accel: 0.06, windup: 20, kickWindup: 16, kickChance: 0.4, punch: 1, kick: 2, gap: 45 },
  // quick and fragile: darts in, swings, backs off, and runs off with a heart if he lands one
  runner: { name: 'Runner', hp: 1, speed: 6.6, accel: 0.1, windup: 12, kickWindup: 12, kickChance: 0, punch: 1, kick: 1, gap: 30 },
  // shrugs off punches; kicks and stomps put him down
  bruiser: { name: 'Bruiser', hp: 6, speed: 3.6, accel: 0.05, windup: 26, kickWindup: 22, kickChance: 0.3, punch: 2, kick: 2, gap: 50, mass: 1.8, bulk: 1.4, armored: true },
  // keeps his distance and lobs bottles; kicks you if you get in close
  thrower: { name: 'Bottle Thrower', hp: 2, speed: 4.4, accel: 0.07, windup: 18, kickWindup: 16, kickChance: 1, punch: 1, kick: 2, gap: 40 },
  // Big Tony: heavy hits, and a charge that leaves him dizzy if he runs into something
  boss: { name: 'Big Tony', hp: 14, speed: 4.2, accel: 0.06, windup: 28, kickWindup: 22, kickChance: 0.35, punch: 2, kick: 3, gap: 55, mass: 2.6, bulk: 1.65, armored: true },
};
export const CHARGE_WINDUP = 50, CHARGE_TIME = 80;
export const IDLE = [0, 0, false, false, false];

// gangsters come from just out of view: behind the man in the side view, up the street ahead of him
// when the camera is behind him (otherwise they'd be behind the camera too)
export function behind() {
  const dir = state.camMode === 'behind' ? (Math.cos(state.camYaw) >= 0 ? 1 : -1) * -1 : (man.fwd.x >= 0 ? 1 : -1);
  return { x: man.x - dir * (state.camMode === 'behind' ? 26 : 20), z: Z_MIN + 0.5 + Math.random() * (Z_MAX - Z_MIN - 1) };
}

// aggro > 1 shortens the pauses between swings and throws
export function spawnGangster(type = 'thug', extraHp = 0, aggro = 1) {
  const kind = GANG_TYPES[type], p = behind(), hp = kind.hp + extraHp;
  const g = new Ragdoll(p.x, p.z, {
    style: 'gangster', look: GANGSTER_LOOKS[type], canFlip: false, type, kind, aggro,
    hp, maxHp: hp, mass: kind.mass || 1, bulk: kind.bulk || 1,
    speed: (kind.speed + Math.random()) * S, accel: kind.accel + Math.random() * 0.03,
    windup: kind.windup, kickWindup: kind.kickWindup, punchCooldown: 30,
    nextMove: Math.random() < kind.kickChance ? 'kick' : 'punch',
    jumpCooldown: 60, flee: 0, stolen: false, throwCooldown: 90, chargeCooldown: 200, charge: null,
    dizzy: false, stompCd: 0, leaveT: 0,
  });
  g.baseSpeed = g.speed; g.baseAccel = g.accel;
  g.heading = Math.atan2(man.z - p.z, man.x - p.x);
  gangsters.push(g);
  return g;
}

export function gangsterBrain(g) {
  // he's down, or you're off being a rat: they stop and stand around
  if (!man.alive || state.playingRat) { if (g.charge) endCharge(g); return IDLE; }
  if (g.charge) return chargeBrain(g);
  const k = g.kind;
  const dx = man.x - g.x, dz = man.z - g.z;
  const dist = Math.hypot(dx, dz);
  const ux = dist > 1e-4 ? dx / dist : 0, uz = dist > 1e-4 ? dz / dist : 0;
  if (g.flee > 0) g.flee--;
  // close in to arm's length, back off (a runner after a swing), or stand off (a thrower in range);
  // plant the feet while swinging
  let go = dist > 0.6 ? 1 : 0;
  if (g.flee > 0) go = -1;
  if (g.type === 'thrower' && dist > 1.6) go = dist > 7.5 ? 1 : dist < 4.5 ? -1 : 0;
  if (g.attacking) go = 0;
  let ix = ux * go, iz = uz * go;
  // keep tracking him through the wind-up (or while standing off), but commit once the blow is on its way
  const windingUp = g.punchT >= 0 ? g.punchT < g.punchW : g.kickT >= 0 ? g.kickT < g.kickW : true;
  if ((dist < 1.6 || go === 0) && dist > 1e-4 && windingUp) {
    let diff = Math.atan2(dz, dx) - g.heading;
    diff = Math.atan2(Math.sin(diff), Math.cos(diff));
    g.heading += diff * 0.2;
  }
  if (g.punchCooldown > 0) g.punchCooldown--;
  if (g.throwCooldown > 0) g.throwCooldown--;
  let punch = false, kick = false;
  const facing = dist > 1e-4 && ux * g.fwd.x + uz * g.fwd.z > 0.8;
  const ready = !g.attacking && g.stun === 0 && g.flee <= 0;
  // each gangster picks his next move ahead of time: kicks reach further, punches need him closer
  const reach = g.nextMove === 'kick' ? 1.15 : 0.85;
  if (ready && g.punchCooldown <= 0 && dist < reach && facing && Math.abs(man.y - g.y) < 0.6) {
    if (g.nextMove === 'kick') kick = true; else punch = true;
    g.nextMove = Math.random() < k.kickChance ? 'kick' : 'punch';
    g.punchCooldown = (k.gap + Math.random() * k.gap) / g.aggro;
    if (g.type === 'runner') g.flee = g.windup + 56 + Math.random() * 30;
  } else if (g.type === 'thrower' && ready && g.throwCooldown <= 0 && dist > 3 && dist < 10 && facing) {
    // the throw is a punch that lets go of a bottle (see resolvePunches)
    punch = true;
    g.throwCooldown = (90 + Math.random() * 70) / g.aggro;
  }
  if (g.type === 'boss') {
    if (g.chargeCooldown > 0) g.chargeCooldown--;
    else if (ready && g.onGround && dist > 3 && dist < 11) {
      g.charge = { t: 0, dx: ux, dz: uz };
      return IDLE;
    }
  }
  // spread out instead of piling onto the same spot
  for (const o of gangsters) {
    if (o === g || !o.alive) continue;
    const ox = g.x - o.x, oz = g.z - o.z, od = Math.hypot(ox, oz);
    if (od < 0.8 && od > 1e-4) { ix += ox / od * 0.6; iz += oz / od * 0.6; }
  }
  // slide around things that are too tall to hop over
  if (g.blocked) iz += (man.z > g.z ? 1 : -1) * 0.8;

  if (g.jumpCooldown > 0) g.jumpCooldown--;
  let jump = false;
  const sp = Math.hypot(g.vx, g.vz);
  if (g.onGround && sp > 0.01) {
    // hop over anything just ahead that's low enough to clear
    const ax = g.x + g.vx / sp * 0.55, az = g.z + g.vz / sp * 0.55;
    for (const b of boxesNear(g.x, 3)) {
      if (ax > b.x0 - BODY_R && ax < b.x1 + BODY_R && az > b.z0 - BODY_R && az < b.z1 + BODY_R &&
          b.top > g.y + 0.05 && b.top - g.y < 1.45) jump = true;
    }
  }
  if (!jump && g.jumpCooldown <= 0 && g.onGround && dist < 2.2 && !man.onGround && Math.random() < 0.04) {
    jump = true;
    g.jumpCooldown = 90 + Math.random() * 60;
  }
  return [ix, iz, jump, punch, kick];
}

// Big Tony paws the ground lining up on you, then charges in a straight line; if he runs into
// something (or the edge of the street) he's left dizzy and wide open
export function chargeBrain(g) {
  const c = g.charge;
  if (g.stun > 0) { endCharge(g); return IDLE; } // kicked out of it
  c.t++;
  const dx = man.x - g.x, dz = man.z - g.z, dist = Math.hypot(dx, dz);
  if (c.t < CHARGE_WINDUP) {
    if (dist > 1e-4) { c.dx = dx / dist; c.dz = dz / dist; }
    let diff = Math.atan2(c.dz, c.dx) - g.heading;
    diff = Math.atan2(Math.sin(diff), Math.cos(diff));
    g.heading += diff * 0.25;
    if (c.t % 12 === 0) dust(g.x - g.fwd.x * 0.25, g.y, g.z - g.fwd.z * 0.25, 4);
    return IDLE;
  }
  if (c.t === CHARGE_WINDUP) { g.speed = g.baseSpeed * 2.6; g.accel = 0.25; }
  if (dist < 0.8 && Math.abs(man.y - g.y) < 0.8) {
    hurtMan(g.kind.kick, 1.8, c.dx, c.dz);
    endCharge(g, 60);
    return IDLE;
  }
  const wall = g.blocked || g.z <= Z_MIN + 0.01 || g.z >= Z_MAX - 0.01;
  if (wall && c.t > CHARGE_WINDUP + 4) {
    endCharge(g);
    g.stun = 130; g.dizzy = true;
    state.shake = Math.max(state.shake, 0.25);
    dust(g.pts.head.x, g.pts.head.y, g.pts.head.z, 10);
    return IDLE;
  }
  if (c.t > CHARGE_WINDUP + CHARGE_TIME) { endCharge(g); return IDLE; }
  return [c.dx, c.dz, false, false, false];
}
export function endCharge(g, rest = 0) {
  g.charge = null; g.speed = g.baseSpeed; g.accel = g.baseAccel;
  g.chargeCooldown = 300 + Math.random() * 180;
  g.punchCooldown = Math.max(g.punchCooldown, rest);
}

export function getBusted(nx, nz) {
  man.knockOut(nx, nz, 1e9); // stays down until the run restarts (blocks.js)
  state.shake = 0.3;
  state.caughtTimer = 210;
  const n = state.cleared;
  say('Busted!', `${n ? `You cleared ${n} block${n > 1 ? 's' : ''}. ` : ''}Back to the start of the street…`, 170);
}

// every blow, bottle and charge that lands on him goes through here; false if it didn't count
export function hurtMan(damage, power, nx, nz) {
  if (!man.alive || man.invuln > 0) return false;
  man.hp -= damage;
  if (man.hp <= 0) { getBusted(nx, nz); return false; }
  man.stagger(nx, nz, power);
  man.invuln = 30;
  state.shake = Math.max(state.shake, 0.1 * power + 0.05);
  return true;
}

// run over: the man loses a heart and is flattened for a moment; a gangster takes 3 and goes flying
export function hitByCar(b, nx, nz) {
  state.shake = Math.max(state.shake, 0.2);
  if (b === man) {
    if (man.invuln > 0) return;
    if (--man.hp <= 0) { getBusted(nx, nz); return; }
    man.knockOut(nx, nz, 70, 1.4);
    say('Watch the traffic!', '', 90);
    return;
  }
  b.hp -= 3;
  if (b.hp <= 0) { downGangster(b, nx, nz, 1.6); return; }
  if (b.charge) endCharge(b);
  b.dizzy = false;
  b.knockOut(nx, nz, 70, 1.2); // gets back up with what's left of his hp
}

export function hurtGangster(g, damage, power, nx, nz, punch = false) {
  g.hp -= damage;
  if (g.hp <= 0) { downGangster(g, nx, nz, power); return; }
  if ((punch && g.kind.armored) || g.dizzy) {
    // takes it without flinching: just a snap of the head
    g.pts.head.px -= nx * 0.03; g.pts.head.pz -= nz * 0.03;
    state.shake = Math.max(state.shake, 0.05);
    return;
  }
  g.stagger(nx, nz, Math.min(power, 1.1));
  state.shake = Math.max(state.shake, 0.06 * power);
}

// out cold for good: he lies there a moment, then he's cleared away (updateGangs)
export function downGangster(g, nx, nz, power = 1) {
  if (g.charge) endCharge(g);
  g.dizzy = false;
  g.knockOut(nx, nz, 1e9, power);
  g.leaveT = 170;
  state.knockouts++;
  state.shake = Math.max(state.shake, 0.15 * power);
  if (g.stolen) {
    g.stolen = false;
    if (man.alive) { man.hp = Math.min(man.maxHp, man.hp + 1); say('Got your heart back!', '', 90); }
  }
  if (g.type === 'boss') say('Big Tony is down!', '', 150);
}

// at the moment a punch or kick is fully extended, hit anyone standing within reach in front
// (minDot: how far round to the side counts as in front, 1 = dead ahead only)
export function landHit(attacker, flag, reach, vReach, limbEnd, targets, onHit, minDot = 0.3) {
  if (!attacker[flag]) return;
  attacker[flag] = false;
  const f = attacker.fwd;
  for (const t of targets) {
    if (!t.alive) continue;
    const dx = t.x - attacker.x, dz = t.z - attacker.z, d = Math.hypot(dx, dz);
    if (d > reach || Math.abs(t.y - attacker.y) > vReach) continue;
    const nx = d > 1e-4 ? dx / d : f.x, nz = d > 1e-4 ? dz / d : f.z;
    if (nx * f.x + nz * f.z < minDot) continue;
    const end = attacker.pts[limbEnd];
    dust(end.x, end.y - 0.05, end.z, 5);
    onHit(t, nx, nz);
  }
}

export function resolvePunches() {
  // a backfist sweeps out to the side, so it also catches someone level with his shoulder
  const back = man.punchStyle === 'back';
  landHit(man, 'punchHit', 1, 0.9, man.punchHand, gangsters,
    (g, nx, nz) => hurtGangster(g, 1, back ? 1.3 : 1, nx, nz, true), back ? -0.1 : 0.3);
  // a round kick lands in front as the turn completes, but the leg's sweep catches anyone to that side
  // too, and it knocks them further
  const round = man.kickStyle === 'round';
  landHit(man, 'kickHit', round ? 1.4 : 1.2, 1.7, man.kickFoot, gangsters,
    (g, nx, nz) => hurtGangster(g, 2, round ? 2.4 : 1.8, nx, nz), round ? -0.3 : 0.3);
  // the gangsters hit back: each blow costs him hearts (heavier gangsters knock him further), and
  // a runner who lands one makes off with a heart until you knock him out
  for (const g of gangsters) {
    if (g.type === 'thrower' && g.punchHit) { g.punchHit = false; throwBottle(g, man); }
    const heft = Math.sqrt(g.mass);
    const landed = (damage, power) => (m, nx, nz) => {
      if (hurtMan(damage, power * heft, nx, nz) && g.type === 'runner' && !g.stolen) { g.stolen = true; g.flee = 240; }
    };
    landHit(g, 'punchHit', 1, 0.9, g.punchHand, [man], landed(g.kind.punch, 0.6));
    landHit(g, 'kickHit', 1.2, 0.9, g.kickFoot, [man], landed(g.kind.kick, 1));
  }
}

export function checkHits() {
  if (!man.alive) return;
  for (const g of gangsters) {
    if (!g.alive || g.stiffness < 0.3) continue;
    const dx = man.x - g.x, dz = man.z - g.z;
    const d = Math.hypot(dx, dz);
    if (d > 0.45) continue;
    const nx = d > 1e-4 ? dx / d : 1, nz = d > 1e-4 ? dz / d : 0;
    const feetAboveG = man.y - g.y;
    if (feetAboveG > 1.25 && feetAboveG < 1.95 && man.vy < 0 && g.stompCd <= 0) {
      // landed on his head: out cold, except Big Tony, who just takes a beating
      man.vy = JUMP_V * 0.9; man.onGround = false; man.jumpsLeft = 1;
      if (g.type === 'boss') { hurtGangster(g, 3, 1.2, -nx, -nz); g.stompCd = 45; }
      else downGangster(g, -nx, -nz);
      state.shake = Math.max(state.shake, 0.15);
      dust(g.pts.head.x, g.pts.head.y, g.pts.head.z, 8);
    } else if (feetAboveG < 1.25 && Math.abs(feetAboveG) < 1.65) {
      // bump shoulders instead of walking through each other
      const push = (0.45 - d) * 0.5;
      man.x += nx * push; man.z += nz * push;
      g.x -= nx * push; g.z -= nz * push;
    }
  }
}

// per-frame upkeep: cooldowns, clearing away the knocked out, and the bottles in the air
export function updateGangs() {
  for (let i = gangsters.length - 1; i >= 0; i--) {
    const g = gangsters[i];
    if (g.stompCd > 0) g.stompCd--;
    if (g.dizzy && g.stun === 0) g.dizzy = false;
    if (!g.leaveT) continue;
    if (--g.leaveT < 60) g.invuln = g.leaveT; // blink before vanishing
    if (g.leaveT <= 0) { scene.remove(g.group); gangsters.splice(i, 1); }
  }
  if (!state.playingRat) updateBottles((nx, nz) => hurtMan(1, 0.6, nx, nz));
}

export function clearGangsters() {
  for (const g of gangsters) scene.remove(g.group);
  gangsters.length = 0;
  clearBottles();
}

// the stolen heart a runner carries over his head, and the stars round a dizzy Big Tony
export function heartIcon() {
  const m = new THREE.Group(), red = mat('#ff3b4e', { emissive: 0xaa1020 });
  for (const x of [-0.042, 0.042]) addBox(m, 0.09, 0.09, 0.05, red, x, 0.03, 0, false);
  addBox(m, 0.1, 0.1, 0.05, red, 0, -0.015, 0, false).rotation.z = Math.PI / 4;
  m.scale.setScalar(1.6);
  return m;
}
export function starsIcon() {
  const m = new THREE.Group(), yellow = mat('#ffe14a', { emissive: 0xaa8800 });
  for (let k = 0; k < 3; k++) {
    const a = k * Math.PI * 2 / 3;
    addBox(m, 0.07, 0.07, 0.07, yellow, Math.cos(a) * 0.22, 0, Math.sin(a) * 0.22, false).rotation.set(0.6, a, 0.6);
  }
  return m;
}
export function renderGangs(t) {
  for (const g of gangsters) {
    const hd = g.pts.head;
    if (g.stolen && !g.heart) g.group.add(g.heart = heartIcon());
    if (g.heart) {
      g.heart.visible = g.stolen;
      g.heart.position.set(hd.x, hd.y + 0.45 + Math.sin(t * 6) * 0.04, hd.z);
      g.heart.quaternion.copy(camera.quaternion);
    }
    if (g.dizzy && !g.stars) g.group.add(g.stars = starsIcon());
    if (g.stars) {
      g.stars.visible = g.dizzy;
      g.stars.position.set(hd.x, hd.y + 0.28, hd.z);
      g.stars.rotation.y = t * 5;
    }
  }
}
