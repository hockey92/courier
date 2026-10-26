// Zombie night: endless waves of zombies instead of the run's crews, on the street (blocks.js) or in Brooklyn
// Heights (heightsrun.js). They come from out of sight and follow the man wherever he goes; each wave is
// bigger and comes at him more at once, with sprinters from wave 3 and brutes from wave 5. A breather and a
// heart between waves; it only ends when they get him.
import { Z_MAX, Z_MIN } from './config.js';
import { say, state } from './state.js';
import { music } from './music.js';
import { arena } from './arena.js';
import { gangsters, man } from './actors.js';
import { spawnGangster } from './combat.js';
import { WEAPONS, pickups, placePickup } from './weapons.js';

export const ZOMBIE_DEBUT = { 3: 'sprinter', 5: 'brute' };
export const ZOMBIE_TIPS = {
  sprinter: 'Sprinters! Fast, but one good hit drops them',
  brute: "Brutes shrug off punches and stomps. Kick them, or hit them with what you're holding",
};
// frames between one wave going down and the next coming
export const BREAK = 300;

// bestKey: where the best wave is saved (each map keeps its own)
export const horde = { queue: [], max: 3, spawnT: 0, groanT: 120, bestKey: 'ragdollBestWave' };

export function hordePlan(n) {
  const pool = ['zombie', 'zombie', 'zombie'];
  if (n >= 3) pool.push('sprinter');
  if (n >= 5) pool.push('brute');
  if (n >= 8) pool.push('sprinter', 'brute');
  const list = [];
  for (let i = 0, count = Math.min(4 + 2 * n, 40); i < count; i++) list.push(pool[Math.floor(Math.random() * pool.length)]);
  const debut = ZOMBIE_DEBUT[n];
  if (debut && !list.slice(0, 2).includes(debut)) list[1] = debut;
  return { list, max: Math.min(3 + Math.floor(n * 0.8), 10) };
}

// on the street: out of sight down the street, from either end, so they close in from both sides (a map
// with its own arena.spawnAt puts them there instead)
export function hordeSpot() {
  const dir = Math.random() < 0.5 ? 1 : -1;
  return { x: man.x + dir * (22 + Math.random() * 6), z: Z_MIN + 0.5 + Math.random() * (Z_MAX - Z_MIN - 1) };
}

// a fresh weapon of each kind the map has, a few steps either side of him
export function dropWeapons() {
  const f = man.fwd;
  let side = 1;
  for (const [type, p] of Object.entries(pickups)) {
    if (arena.weapons && !arena.weapons.includes(type)) { p.live = false; continue; }
    const x = man.x + f.x * 5 * side, z = man.z + f.z * 5 * side;
    const at = arena.dropNear && arena.dropNear(x, z);
    if (at) Object.assign(p, { live: true, ...at, ammo: WEAPONS[type].ammo, wait: false });
    else placePickup(p, man.x + (f.x >= 0 ? 5 : -5) * side, 0.6);
    side = -side;
  }
}

export function startHorde(n) {
  state.zWave = n; state.zBreak = 0;
  const plan = hordePlan(n);
  horde.queue = plan.list; horde.max = plan.max;
  horde.spawnT = n === 1 ? 90 : 30;
  dropWeapons();
  const tip = ZOMBIE_TIPS[ZOMBIE_DEBUT[n]];
  music.alarm();
  say(`Wave ${n}`, tip || (n === 1 ? "Zombies! They keep coming, and they'll follow you anywhere" : `${plan.list.length} zombies coming`), tip ? 240 : 150);
}

export function waveSurvived() {
  const n = state.zWave;
  if (n > state.bestWave) {
    state.bestWave = n;
    localStorage.setItem(horde.bestKey, n);
  }
  const healed = man.hp < man.maxHp ? 1 : 0;
  man.hp += healed;
  state.zBreak = BREAK;
  say(`Wave ${n} survived!`, `${healed ? '+1 heart · ' : ''}Catch your breath, more are coming…`, 200);
  music.cheer();
}

export function updateHorde() {
  let standing = 0;
  for (const g of gangsters) if (!g.leaveT) standing++;
  state.crewLeft = horde.queue.length + standing;
  if (state.zBreak > 0) {
    if (--state.zBreak <= 0) startHorde(state.zWave + 1);
    return;
  }
  if (horde.spawnT > 0) horde.spawnT--;
  else if (horde.queue.length && standing < horde.max) {
    spawnGangster(horde.queue.shift(), 0, 1 + 0.06 * (state.zWave - 1), arena.spawnAt ? null : hordeSpot());
    horde.spawnT = 25 + Math.random() * 45;
  }
  if (state.crewLeft === 0) waveSurvived();
  // now and then one of them moans, if any are close enough to hear
  if (--horde.groanT <= 0) {
    horde.groanT = 90 + Math.random() * 150;
    if (gangsters.some(g => !g.leaveT && Math.hypot(g.x - man.x, g.z - man.z) < 14)) music.groan();
  }
}
