// The game on the Brooklyn Heights map: a run from turf to turf across the neighbourhood. A beacon (and the
// minimap) shows where the next crew hangs out; get there and they come at you; knock them all out to clear
// the turf, get two hearts back, and the next one lights up. Every fifth turf is Big Tony's. A basket of
// apples waits at each: the only weapon here. Busted sends you back to the Promenade to start again.
import * as THREE from 'three';
import { say, state } from './state.js';
import { scene } from './scene.js';
import { music } from './music.js';
import { gangsters, man } from './actors.js';
import { clearGangsters, spawnGangster } from './combat.js';
import { WEAPONS } from './weapons.js';
import { DEBUT, TIPS, wavePlan } from './waves.js';

// in order; after the tenth they come round again with bigger crews
export const TURFS = [
  { name: 'the Promenade', x: -8, z: -230 },
  { name: 'Montague St', x: 300, z: 0 },
  { name: 'Columbus Park', x: 660, z: 90 },
  { name: 'Cadman Plaza Park', x: 660, z: -470 },
  { name: 'Pier 1', x: -175, z: -660 },
  { name: 'Pier 2', x: -215, z: -428 },
  { name: 'Pier 5', x: -225, z: 162 },
  { name: 'Atlantic Ave', x: 350, z: 508 },
  { name: 'Cranberry St', x: 250, z: -530 },
  { name: 'the War Memorial', x: 660, z: -650 },
];
export const turfOf = n => TURFS[(n - 1) % TURFS.length];
const ARRIVE = 32;      // how close he has to get before the crew comes out
const STRAY = 48;       // a gangster further off than this comes back round near him

// opts: spotNear(x, z) → [x, y, z] or null, place(ragdoll, x, z, y), outdoors(x, z), home { x, z, heading }
export function createRun({ spotNear, place, outdoors, home }) {
  const run = { phase: 'travel', queue: [], max: 2, bossHp: 0, spawnT: 0, spot: null };

  // the beacon over the next turf: a column of light you can see from across the neighbourhood
  const beacon = new THREE.Group();
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.4, 160, 12, 1, true),
    new THREE.MeshBasicMaterial({ color: 0xffc94a, transparent: true, opacity: 0.32, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false }));
  beam.position.y = 80;
  const ring = new THREE.Mesh(new THREE.TorusGeometry(3, 0.18, 6, 32).rotateX(Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: 0xffd76a, fog: false }));
  ring.position.y = 0.2;
  beacon.add(beam, ring);
  scene.add(beacon);

  // a gangster's spot: 12–22 m from him, out in the open and at about his level; else by the turf
  function spawnAt() {
    for (let k = 0; k < 60; k++) {
      const a = Math.random() * Math.PI * 2, r = 12 + Math.random() * 10;
      const cx = man.x + Math.cos(a) * r, cz = man.z + Math.sin(a) * r;
      if (!outdoors(cx, cz)) continue;
      const s = spotNear(cx, cz);
      if (s && Math.hypot(s[0] - cx, s[2] - cz) < 3 && Math.abs(s[1] - man.y) < 2.5) return { x: s[0], y: s[1], z: s[2] };
    }
    return { x: run.spot.x + (Math.random() - 0.5) * 6, y: run.spot.y, z: run.spot.z + (Math.random() - 0.5) * 6 };
  }
  // the basket of apples waits a few steps from the turf's centre
  function pickupAt(type, n) {
    const t = turfOf(n), s = spotNear(t.x + 4, t.z + 2);
    return s ? { x: s[0], y: s[1], z: s[2] } : null;
  }

  function start(n) {
    state.block = n;
    const t = turfOf(n), s = spotNear(t.x, t.z) || [t.x, man.y, t.z];
    run.spot = { x: s[0], y: s[1], z: s[2] };
    const plan = wavePlan(n);
    Object.assign(run, { phase: 'travel', queue: plan.list, max: plan.max, bossHp: plan.bossHp, spawnT: 30 });
    beacon.position.set(s[0], s[1], s[2]);
    beacon.visible = true;
    const tip = TIPS[DEBUT[n]];
    say(`Turf ${n}: ${cap(t.name)}`, tip || `A crew's hanging out at ${t.name}. Follow the light`, tip ? 260 : 170);
  }
  function cleared() {
    state.cleared = state.block;
    if (state.cleared > state.bestBlocks) { state.bestBlocks = state.cleared; localStorage.setItem('ragdollBestTurfs', state.bestBlocks); }
    const before = man.hp;
    man.hp = Math.min(man.maxHp, man.hp + 2);
    const healed = man.hp - before, next = turfOf(state.block + 1);
    music.cheer();
    run.phase = 'cleared';
    run.spawnT = 200;
    say('Turf cleared!', `${healed ? `+${healed} heart${healed > 1 ? 's' : ''} · ` : ''}Next: ${next.name}`, 200);
  }
  function reset() {
    clearGangsters();
    man.knocked = 0;
    man.getUp();
    place(man, man.x, man.z, man.y);
    const s = spotNear(home.x, home.z);
    place(man, s[0], s[2], s[1], home.heading);
    Object.assign(man, { invuln: 90, stun: 0, hp: man.maxHp });
    state.cleared = 0; state.knockouts = 0; state.survived = 0; state.fade = 0;
    start(1);
  }

  function update() {
    if (state.caughtTimer > 0) {
      // busted: black out, then back to the Promenade
      if (state.caughtTimer === 210) {
        const n = state.cleared;
        say('Busted!', `${n ? `You cleared ${n} turf${n > 1 ? 's' : ''}. ` : ''}Back to the Promenade…`, 170);
      }
      if (state.caughtTimer <= 40) state.fade = (41 - state.caughtTimer) / 40;
      if (state.caughtTimer === 1) reset();
      return;
    }
    let standing = 0;
    for (const g of gangsters) if (!g.leaveT) standing++;
    if (run.phase === 'cleared') {
      if (--run.spawnT <= 0) start(state.block + 1);
      return;
    }
    state.crewLeft = run.queue.length + standing;
    if (run.phase === 'travel') {
      if (Math.hypot(man.x - run.spot.x, man.z - run.spot.z) < ARRIVE && Math.abs(man.y - run.spot.y) < 4) {
        run.phase = 'fight';
        beacon.visible = false;
        if (state.block % 5 === 0) music.alarm();
        say('Here they come!', `${run.queue.length} of them`, 90);
      }
      return;
    }
    if (run.spawnT > 0) run.spawnT--;
    else if (run.queue.length && standing < run.max) {
      const type = run.queue.shift();
      spawnGangster(type, type === 'boss' ? run.bossHp : 0, 1 + 0.05 * (state.block - 1));
      run.spawnT = 50 + Math.random() * 60;
    }
    // stragglers left behind (he ran off, or they got stuck round a corner) come back round near him
    for (const g of gangsters) {
      if (g.alive && !g.leaveT && Math.hypot(g.x - man.x, g.z - man.z) > STRAY) {
        const p = spawnAt();
        place(g, p.x, p.z, p.y);
      }
    }
    if (state.crewLeft === 0) cleared();
  }

  function render(t) {
    ring.rotation.y = t;
    beam.material.opacity = 0.26 + Math.sin(t * 3) * 0.06;
  }

  return { run, start, update, render, spawnAt, pickupAt, get target() { return run.phase === 'travel' ? run.spot : null; } };
}
const cap = s => s[0].toUpperCase() + s.slice(1);

// ---------- HUD ----------
const $ = id => document.getElementById(id);
export function updateHud(distance) {
  $('hearts').textContent = man.hp > 0 ? '♥'.repeat(man.hp) + '♡'.repeat(Math.max(0, man.maxHp - man.hp)) : '';
  const w = man.weapon;
  $('ammo').textContent = w ? `${WEAPONS[w.type].name}: ${w.ammo}` : '';
  const t = turfOf(state.block);
  $('turf').textContent = `Turf ${state.block}: ${cap(t.name)}`;
  const crew = $('crew');
  crew.textContent = distance !== null ? `Go to ${t.name}: ${Math.round(distance)} m` : `Crew left: ${state.crewLeft}`;
  crew.classList.toggle('go', distance !== null);
  $('score').textContent = `Best: ${state.bestBlocks} turf${state.bestBlocks === 1 ? '' : 's'} · KOs: ${state.knockouts} · Time: ${Math.floor(state.survived)}s`;
  const b = state.banner, banner = $('banner');
  banner.style.display = b ? 'block' : 'none';
  if (b) { $('bannerTitle').textContent = b.text; $('bannerSub').textContent = b.sub; }
  const boss = gangsters.find(g => g.type === 'boss' && !g.leaveT);
  $('boss').style.display = boss ? 'block' : 'none';
  if (boss) $('bossFill').style.width = `${Math.max(0, boss.hp / boss.maxHp) * 100}%`;
  $('fade').style.opacity = state.fade;
}
