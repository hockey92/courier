// Entry point: the fixed-step update, render and the main loop.
import { state } from './state.js';
import { camera, renderer, scene } from './scene.js';
import { boxesNear, liveChunks, syncChunks } from './world.js';
import { music } from './music.js';
import { keys, queued } from './input.js';
import { updateDust } from './effects.js';
import { NAMES } from './ragdoll.js';
import { gangsters, man } from './actors.js';
import { updateCamera } from './view.js';
import { setCamMode, setPlayingRat, setSkin, updateHud } from './ui.js';
import { renderGarbage, updateGarbage } from './garbage.js';
import { rats, updateRats } from './rats.js';
import { behind, checkHits, gangsterBrain, hitByCar, renderGangs, resolvePunches, spawnGangster, updateGangs } from './combat.js';
import { cars, updateTraffic } from './traffic.js';
import { flying, grab, renderCarry, updateCarry } from './carry.js';
import { bottles, renderBottles } from './bottles.js';
import { renderSewer, sewer, updateSewer } from './sewer.js';
import { holdAtGate, startBlock, updateBlocks, wave } from './blocks.js';

// ---------- Update ----------
function update() {
  const right = (keys.ArrowRight || keys.KeyD ? 1 : 0) - (keys.ArrowLeft || keys.KeyA ? 1 : 0);
  const down = (keys.ArrowDown || keys.KeyS ? 1 : 0) - (keys.ArrowUp || keys.KeyW ? 1 : 0);
  let ix = right, iz = down;
  if (state.playingRat) {
    // the keys drive the rat; the man just stands there taking a break
    state.ratPlayer.input = { turn: right, go: -down, hop: queued.jump, bite: queued.punch };
    queued.jump = queued.punch = queued.kick = queued.round = queued.grab = false;
    queued.aim = null;
    ix = iz = 0;
  } else if (state.camMode === 'behind') {
    // steer: left/right turn him and the camera, up runs where the camera looks, down runs back towards it
    if (man.alive) state.camYaw += right * 0.045;
    ix = Math.cos(state.camYaw) * -down; iz = Math.sin(state.camYaw) * -down;
    if (right && !down && man.alive) {
      let diff = state.camYaw - man.heading;
      diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      man.heading += diff * 0.3;
    }
  }
  const wasDown = !man.alive;
  // a mouse attack turns him to face where it was clicked
  const aimed = queued.aim && man.alive && (queued.punch || queued.kick || queued.round);
  if (aimed) {
    const ax = queued.aim.x - man.x, az = queued.aim.z - man.z;
    if (Math.hypot(ax, az) > 0.3) man.heading = Math.atan2(az, ax);
  }
  queued.aim = null;
  // E picks up or throws; while he's holding something, punch throws it too
  if (queued.grab || (queued.punch && man.holding)) { grab(); queued.punch = false; }
  queued.grab = false;
  if ((queued.punch || queued.kick || queued.round) && man.alive && !man.holding) {
    // turn to face the nearest gangster in reach (for a click, only one roughly where it was aimed)
    let target = null, bestD = 1.6;
    const f = man.fwd;
    for (const g of gangsters) {
      const dx = g.x - man.x, dz = g.z - man.z, d = Math.hypot(dx, dz);
      if (aimed && d > 0.01 && (dx * f.x + dz * f.z) / d < 0.5) continue;
      if (g.alive && d < bestD && Math.abs(g.y - man.y) < 0.9) { target = g; bestD = d; }
    }
    if (target) man.heading = Math.atan2(target.z - man.z, target.x - man.x);
  }
  man.control(ix, iz, queued.jump, queued.punch, queued.round ? 'round' : queued.kick);
  queued.jump = queued.punch = queued.kick = queued.round = false;
  holdAtGate();
  if (wasDown && man.alive) man.invuln = 90;

  for (const g of gangsters) {
    const [gx, gz, gj, gp, gk] = gangsterBrain(g);
    g.control(gx, gz, gj, gp, gk);
    // stragglers that fall far behind re-enter just out of view behind him
    if (g.alive && Math.hypot(g.x - man.x, g.z - man.z) > 34) {
      const p = behind();
      const sx = p.x - g.x, sz = p.z - g.z;
      g.x = p.x; g.z = p.z; g.y = 0; g.vx = g.vz = g.vy = 0; g.onGround = true;
      for (const n of NAMES) { const q = g.pts[n]; q.x += sx; q.px += sx; q.z += sz; q.pz += sz; }
    }
  }

  updateTraffic([man, ...gangsters], hitByCar);
  updateCarry();
  resolvePunches();
  checkHits();
  man.step();
  for (const g of gangsters) g.step();

  if (man.alive && !state.playingRat) state.survived += 1 / 60;
  updateGangs();

  updateGarbage();
  updateRats();
  updateSewer();
  updateBlocks(); // after the sewer, which also eases the fade

  updateDust();

  if (state.shake > 0) state.shake *= 0.85;
  if (state.caughtTimer > 0) state.caughtTimer--;
  if (state.banner && --state.banner.t <= 0) state.banner = null;
}

// ---------- Render ----------
function render() {
  updateCamera();
  syncChunks(state.camX);
  man.updateMeshes();
  for (const g of gangsters) g.updateMeshes();
  renderCarry();
  const t = performance.now() / 1000;
  for (const c of liveChunks.values()) for (const animate of c.chillers) animate(t);
  renderGangs(t);
  renderBottles();
  renderSewer(t);
  renderGarbage();
  renderer.render(scene, camera);
  updateHud();
}

// Fixed-timestep loop so physics feels the same on any refresh rate
setCamMode(state.camMode);
startBlock(1);

let last = performance.now(), acc = 0, paused = false;
function loop(now) {
  acc += Math.min(100, now - last); last = now;
  while (acc >= 1000 / 60) { if (!paused) update(); acc -= 1000 / 60; }
  render();
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

// handy for debugging from the console
window.game = {
  man, gangsters, update, render, keys, boxesNear,
  jump() { queued.jump = true; },
  punch() { queued.punch = true; },
  kick() { queued.kick = true; },
  roundKick() { queued.round = true; },
  grab() { queued.grab = true; },
  music, rats, setSkin, setPlayingRat, sewer,
  state, wave, startBlock, spawnGangster, bottles, cars, flying,
  set paused(v) { paused = v; }, get paused() { return paused; },
};
