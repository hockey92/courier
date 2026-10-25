// Gangsters: spawning, their fighting brain, landing punches and kicks, stomps and getting busted.
import { BODY_R, JUMP_V, S, Z_MAX, Z_MIN } from './config.js';
import { state } from './state.js';
import { boxesNear } from './world.js';
import { dust } from './effects.js';
import { Ragdoll } from './ragdoll.js';
import { gangsters, man } from './actors.js';

// gangsters come from just out of view: behind the man in the side view, up the street ahead of him
// when the camera is behind him (otherwise they'd be behind the camera too)
export function behind() {
  const dir = state.camMode === 'behind' ? (Math.cos(state.camYaw) >= 0 ? 1 : -1) * -1 : (man.fwd.x >= 0 ? 1 : -1);
  return { x: man.x - dir * (state.camMode === 'behind' ? 26 : 20), z: Z_MIN + 0.5 + Math.random() * (Z_MAX - Z_MIN - 1) };
}

export function spawnGangster() {
  const p = behind();
  const g = new Ragdoll(p.x, p.z, {
    style: 'gangster', canFlip: false,
    speed: 4.8 * S + Math.random() * 1.2 * S, accel: 0.06 + Math.random() * 0.03,
    windup: 20, kickWindup: 16, punchCooldown: 30, nextMove: Math.random() < 0.4 ? 'kick' : 'punch',
  });
  g.heading = Math.atan2(man.z - p.z, man.x - p.x);
  g.jumpCooldown = 60;
  gangsters.push(g);
}

export function gangsterBrain(g) {
  // he's down, or you're off being a rat: they stop and stand around
  if (!man.alive || state.playingRat) return [0, 0, false, false, false];
  let dx = man.x - g.x, dz = man.z - g.z;
  const dist = Math.hypot(dx, dz);
  // close in to arm's length, then plant the feet while swinging
  const approach = dist > 0.6 && !g.attacking;
  let ix = approach ? dx / dist : 0, iz = approach ? dz / dist : 0;
  // keep tracking him through the wind-up, but commit once the blow is on its way
  const windingUp = g.punchT >= 0 ? g.punchT < g.windup : g.kickT >= 0 ? g.kickT < g.kickWindup : true;
  if (dist < 1.6 && dist > 1e-4 && windingUp) {
    let diff = Math.atan2(dz, dx) - g.heading;
    diff = Math.atan2(Math.sin(diff), Math.cos(diff));
    g.heading += diff * 0.2;
  }
  if (g.punchCooldown > 0) g.punchCooldown--;
  let punch = false, kick = false;
  const facing = dist > 1e-4 && (dx * g.fwd.x + dz * g.fwd.z) / dist > 0.8;
  // each gangster picks his next move ahead of time: kicks reach further, punches need him closer
  const reach = g.nextMove === 'kick' ? 1.15 : 0.85;
  if (!g.attacking && g.punchCooldown <= 0 && g.stun === 0 && dist < reach && facing && Math.abs(man.y - g.y) < 0.6) {
    if (g.nextMove === 'kick') kick = true; else punch = true;
    g.nextMove = Math.random() < 0.4 ? 'kick' : 'punch';
    g.punchCooldown = 45 + Math.random() * 45;
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

export function getBusted(nx, nz) {
  man.knockOut(nx, nz, 120);
  if (state.survived > state.best) { state.best = state.survived; localStorage.setItem('ragdollBestTime', state.best.toFixed(1)); }
  state.survived = 0;
  state.shake = 0.3;
  state.caughtTimer = 120;
}

// at the moment a punch or kick is fully extended, hit anyone standing within reach in front
export function landHit(attacker, flag, reach, vReach, limbEnd, targets, onHit) {
  if (!attacker[flag]) return;
  attacker[flag] = false;
  const f = attacker.fwd;
  for (const t of targets) {
    if (!t.alive) continue;
    const dx = t.x - attacker.x, dz = t.z - attacker.z, d = Math.hypot(dx, dz);
    if (d > reach || Math.abs(t.y - attacker.y) > vReach) continue;
    const nx = d > 1e-4 ? dx / d : f.x, nz = d > 1e-4 ? dz / d : f.z;
    if (nx * f.x + nz * f.z < 0.3) continue;
    const end = attacker.pts[limbEnd];
    dust(end.x, end.y - 0.05, end.z, 5);
    onHit(t, nx, nz);
  }
}

export function resolvePunches() {
  const hurt = (damage, power) => (g, nx, nz) => {
    g.hp -= damage;
    if (g.hp <= 0) {
      g.knockOut(nx, nz, 180, power);
      state.knockouts++;
      state.shake = 0.15 * power;
    } else {
      g.stagger(nx, nz, Math.min(power, 1.1));
      state.shake = Math.max(state.shake, 0.06 * power);
    }
  };
  landHit(man, 'punchHit', 1, 0.9, 'handR', gangsters, hurt(1, 1));
  landHit(man, 'kickHit', 1.2, 1.7, 'footL', gangsters, hurt(2, 1.8));
  // the gangsters hit back: each blow costs him hearts, and he's busted when they run out
  const hitMan = (damage, power) => (m, nx, nz) => {
    if (m.invuln > 0) return;
    m.hp -= damage;
    if (m.hp <= 0) { getBusted(nx, nz); return; }
    m.stagger(nx, nz, power);
    m.invuln = 30;
    state.shake = Math.max(state.shake, 0.1 * power + 0.05);
  };
  for (const g of gangsters) {
    landHit(g, 'punchHit', 1, 0.9, 'handR', [man], hitMan(1, 0.6));
    landHit(g, 'kickHit', 1.2, 0.9, 'footL', [man], hitMan(2, 1));
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
    if (feetAboveG > 1.25 && feetAboveG < 1.95 && man.vy < 0) {
      // landed on his head
      g.knockOut(-nx, -nz, 180);
      man.vy = JUMP_V * 0.9; man.onGround = false; man.jumpsLeft = 1;
      state.knockouts++;
      state.shake = 0.15;
      dust(g.pts.head.x, g.pts.head.y, g.pts.head.z, 8);
    } else if (feetAboveG < 1.25 && Math.abs(feetAboveG) < 1.65) {
      // bump shoulders instead of walking through each other
      const push = (0.45 - d) * 0.5;
      man.x += nx * push; man.z += nz * push;
      g.x -= nx * push; g.z -= nz * push;
    }
  }
}
