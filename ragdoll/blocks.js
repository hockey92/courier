// Blocks: the run is a walk uptown one block at a time. Each block has a crew to knock out; until
// they're all down the light at the crossing stays red and you can't cross. Every fifth block is
// Big Tony's. Getting busted ends the run and starts it again from the first block.
import { BLOCK, streetName } from './config.js';
import { say, state } from './state.js';
import { signalMats } from './world.js';
import { music } from './music.js';
import { NAMES } from './ragdoll.js';
import { gangsters, man } from './actors.js';
import { clearGangsters, spawnGangster } from './combat.js';
import { setCamMode, setPlayingRat } from './ui.js';

export const gateX = n => n * BLOCK;
// the kind of gangster each block introduces, and the tip shown when it does
export const DEBUT = { 2: 'runner', 3: 'bruiser', 4: 'thrower', 5: 'boss' };
export const TIPS = {
  runner: 'Runners drop in one hit, but they steal a heart and run. Knock them out to get it back',
  bruiser: 'Bruisers shrug off punches. Kick them, or stomp on their heads',
  thrower: 'Bottle throwers hang back. Dodge the bottles and close in',
  boss: "Big Tony's block! Sidestep his charge and he'll run into something",
};

// who's on block n: more of them, more kinds and more at once the further uptown you get
export function wavePlan(n) {
  if (n % 5 === 0) {
    const visit = n / 5;
    return { list: ['boss', ...Array(visit).fill('thug')], max: 2, bossHp: 4 * (visit - 1) };
  }
  const pool = ['thug', 'thug'];
  if (n >= 2) pool.push('runner', 'runner');
  if (n >= 3) pool.push('bruiser');
  if (n >= 4) pool.push('thrower', 'thrower');
  const list = [];
  for (let i = 0, count = Math.min(3 + n, 12); i < count; i++) list.push(pool[Math.floor(Math.random() * pool.length)]);
  const debut = DEBUT[n];
  if (debut && !list.slice(0, 2).includes(debut)) list[1] = debut;
  return { list, max: Math.min(2 + Math.floor(n / 3), 4), bossHp: 0 };
}

export const wave = { queue: [], max: 2, bossHp: 0, spawnT: 0, nudge: 0 };

export function setSignal(go) {
  state.gateOpen = go;
  signalMats.red.emissiveIntensity = go ? 0 : 2;
  signalMats.green.emissiveIntensity = go ? 2 : 0;
}

export function startBlock(n) {
  state.block = n;
  const plan = wavePlan(n);
  wave.queue = plan.list; wave.max = plan.max; wave.bossHp = plan.bossHp;
  wave.spawnT = n === 1 ? 120 : 45;
  setSignal(false);
  const tip = TIPS[DEBUT[n]];
  if (n % 5 === 0) music.alarm();
  say(`Block ${n}`, tip || `Knock out the crew to cross ${streetName(n)}`, tip ? 260 : 150);
}

// the man waits at the curb while the light is red; called straight after he moves
export function holdAtGate() {
  if (state.gateOpen || state.playingRat) return;
  const x = gateX(state.block) - 0.35;
  if (man.x <= x) return;
  man.x = x;
  if (man.vx > 0) man.vx = 0;
  if (wave.nudge <= 0 && !state.banner) {
    say("Don't walk!", `Knock out the crew first: ${state.crewLeft} left`, 100);
    wave.nudge = 240;
  }
}

export function updateBlocks() {
  if (wave.nudge > 0) wave.nudge--;
  if (state.caughtTimer > 0) {
    // busted: black out, then start the run again
    if (state.caughtTimer <= 40) state.fade = (41 - state.caughtTimer) / 40;
    if (state.caughtTimer === 1) resetRun();
    return;
  }
  if (state.playingRat) return;
  let standing = 0;
  for (const g of gangsters) if (!g.leaveT) standing++;
  state.crewLeft = wave.queue.length + standing;
  if (!state.gateOpen) {
    if (wave.spawnT > 0) wave.spawnT--;
    else if (wave.queue.length && standing < wave.max) {
      const type = wave.queue.shift();
      spawnGangster(type, type === 'boss' ? wave.bossHp : 0, 1 + 0.05 * (state.block - 1));
      wave.spawnT = 50 + Math.random() * 60;
    }
    if (state.crewLeft === 0) blockCleared();
  } else if (man.x > gateX(state.block) + 3) {
    startBlock(state.block + 1);
  }
}

export function blockCleared() {
  setSignal(true);
  state.cleared = state.block;
  if (state.cleared > state.bestBlocks) {
    state.bestBlocks = state.cleared;
    localStorage.setItem('ragdollBestBlocks', state.bestBlocks);
  }
  const before = man.hp;
  man.hp = Math.min(man.maxHp, man.hp + 2);
  const healed = man.hp - before;
  say('Block cleared!', `${healed ? `+${healed} heart${healed > 1 ? 's' : ''} · ` : ''}The light's green: cross ${streetName(state.block)}`, 200);
  music.cheer();
}

// back to the start of the street with full hearts and the first block's crew
export function resetRun() {
  if (state.playingRat) setPlayingRat(false);
  clearGangsters();
  man.x = 0; man.z = 1; man.y = 0;
  for (const n of NAMES) Object.assign(man.pts[n], { x: 0, y: 1, z: 1, px: 0, py: 1, pz: 1 });
  man.knocked = 0;
  man.getUp();
  Object.assign(man, { x: 0, z: 1, heading: 0, invuln: 90, stun: 0, hp: man.maxHp });
  state.camYaw = 0; state.camX = 0; state.camZ = 1;
  state.cleared = 0; state.knockouts = 0; state.survived = 0;
  setCamMode(state.camMode);
  startBlock(1);
}
