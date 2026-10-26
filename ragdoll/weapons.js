// What he can arm himself with. An AK-47 (guns.js) and a basket of apples (apples.js) float in the street
// on every block; walking over one takes it, putting down whatever he was holding in its place. E puts it
// down; F or the left button fires or throws where he's aiming (no aim assist: see main.js for the aim).
import * as THREE from 'three';
import { BLOCK } from './config.js';
import { say, state } from './state.js';
import { scene } from './scene.js';
import { glowMat } from './materials.js';
import { arena } from './arena.js';
import { man } from './actors.js';
import { buildAk, renderGun, updateGun, updateGunFx } from './guns.js';
import { buildBasket, renderApples, updateAppleFx, updateApples } from './apples.js';

// ammo: a full load; x: where its pickup goes, metres into each block; lift: how high it floats
export const WEAPONS = {
  ak: {
    name: 'AK-47', ammo: 30, x: 7, lift: 0.6, scale: 1.3, build: buildAk, more: 'Reloaded!',
    tip: n => `${n} rounds · F or left click fires where you aim, hold it for full auto · E puts it down`,
  },
  apples: {
    name: 'Apples', ammo: 12, x: 13, lift: 0.35, scale: 1, build: buildBasket, more: 'More apples!',
    tip: n => `${n} apples · F or left click throws one where you aim, hold it to keep throwing · E puts them down`,
  },
};

// the one of each lying in the street, floating and turning so it's easy to spot; one he's put down (or
// dropped) waits until he's stepped away before he can pick it up again
export const pickups = {};
for (const [type, kind] of Object.entries(WEAPONS)) {
  const mesh = kind.build(), glow = new THREE.Sprite(glowMat);
  mesh.scale.setScalar(kind.scale);
  mesh.visible = glow.visible = false;
  glow.scale.setScalar(1.6);
  scene.add(glow);
  pickups[type] = { type, live: false, x: 0, y: 0, z: 0, ammo: kind.ammo, wait: false, mesh, glow };
}
export let pickupBlock = 0;

// a fresh one a few steps into the block, clear of crates and bins
export function placePickup(p, x, z) {
  for (let k = 0; k < 10; k++, x += 1) {
    if (!arena.boxesNear(x, 2, z).some(b => x > b.x0 - 0.5 && x < b.x1 + 0.5 && z > b.z0 - 0.5 && z < b.z1 + 0.5)) break;
  }
  Object.assign(p, { live: true, x, y: 0, z, ammo: WEAPONS[p.type].ammo, wait: false });
}

export function giveWeapon(type, ammo = WEAPONS[type].ammo) {
  man.weapon = { type, ammo, cooldown: 0 };
}

// set down where he's standing (E, swapping for another, or dropped when he's knocked down)
export function putDown(ahead = 0) {
  const w = man.weapon;
  if (!w) return;
  const f = man.fwd;
  Object.assign(pickups[w.type], { live: true, x: man.x + f.x * ahead, y: man.y, z: man.z + f.z * ahead, ammo: w.ammo, wait: true });
  man.weapon = null; man.aiming = false;
}

// a fresh one of each for the block he's on
export function stockPickups() {
  pickupBlock = state.block;
  for (const p of Object.values(pickups)) {
    if (arena.weapons && !arena.weapons.includes(p.type)) { p.live = false; continue; }
    const at = arena.pickupAt && arena.pickupAt(p.type, state.block);
    if (at) Object.assign(p, { live: true, ...at, ammo: WEAPONS[p.type].ammo, wait: false });
    else placePickup(p, (state.block - 1) * BLOCK + WEAPONS[p.type].x, 0.6);
  }
}

// firing: the trigger's held; aimYaw: the way he's aiming; aimLock: keep facing it even when not firing
export function updateWeapons(firing, aimYaw, aimLock) {
  if (state.block !== pickupBlock) stockPickups();
  for (const p of Object.values(pickups)) {
    const near = Math.hypot(man.x - p.x, man.z - p.z);
    if (p.wait && near > 1.2) p.wait = false;
    if (!p.live || p.wait || !man.alive || man.holding || state.playingRat || near > 0.7 || Math.abs(man.y - p.y) > 1) continue;
    p.live = false;
    const had = man.weapon, kind = WEAPONS[p.type], same = had && had.type === p.type;
    if (had && !same) putDown();
    giveWeapon(p.type, Math.max(p.ammo, same ? had.ammo : 0));
    say(same ? kind.more : `${kind.name}!`, kind.tip(man.weapon.ammo), 150);
  }

  const w = man.weapon;
  if (w && !man.alive) putDown();
  else if (w) {
    man.aiming = aimLock || firing;
    if (man.aiming) man.heading = aimYaw;
    if (w.type === 'ak') updateGun(w, firing);
    else updateApples(w);
  }
  updateGunFx();
  updateAppleFx();
}

export function renderWeapons(t) {
  for (const p of Object.values(pickups)) {
    p.mesh.visible = p.glow.visible = p.live;
    if (!p.live) continue;
    const lift = WEAPONS[p.type].lift;
    p.mesh.position.set(p.x, p.y + lift + Math.sin(t * 3) * 0.06, p.z);
    p.mesh.rotation.set(0, t * 1.5, 0);
    p.glow.position.set(p.x, p.y + lift + 0.1, p.z);
  }
  renderGun();
  renderApples();
}
