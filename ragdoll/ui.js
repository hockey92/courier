// On-screen UI: skin picker, camera switch, man/rat switch, help bar and the HUD.
import { Z_MAX, streetName } from './config.js';
import { state } from './state.js';
import { camera, scene } from './scene.js';
import { liveChunks } from './world.js';
import { SKINS, SKIN_ORDER } from './looks.js';
import { gangsters, man } from './actors.js';
import { camPos } from './view.js';
import { rats } from './rats.js';
import { leaveSewer } from './sewer.js';
import { WEAPONS } from './weapons.js';

// skin picker: the buttons in the corner or the C key
export const skinName = document.getElementById('skinName');
export function changeSkin(dir) {
  const i = SKIN_ORDER.indexOf(man.skin);
  const next = SKIN_ORDER[(i + dir + SKIN_ORDER.length) % SKIN_ORDER.length];
  setSkin(next);
}
export function setSkin(name) {
  man.setSkin(name);
  localStorage.setItem('ragdollSkin', name);
  skinName.textContent = SKINS[name].name;
}
skinName.textContent = SKINS[man.skin].name;

// camera switch: the button in the corner or the V key
export const camBtn = document.getElementById('camBtn'), helpBar = document.getElementById('help');
export const HELP_MOVE = {
  behind: '← → turn · ↑ run · ↓ run back · click the game to steer with the mouse (Esc lets go) · weapons aim where the camera looks',
  side: '← → run · ↑ ↓ move up and down the street · weapons aim at the mouse cursor (or where he faces if you leave the mouse alone)',
};
export const HELP_REST = 'Space jump (again in the air for a flip) · F punch · G kick (hits twice as hard) · H spinning round kick (also catches anyone to the side) · E pick up a crate or trash can, E again (or F) to throw it · walk over the AK-47 or the apple basket to pick it up (it swaps for what you hold): F or left click fires or throws where you aim (hold for full auto), E puts it down · mouse: left click punch / throw, right click kick, middle or Shift+click round kick (aimed at the cursor, or where he faces while steering with the mouse) · stomp on heads · knock out the whole crew and the light turns green so you can cross to the next block · C change skin · V camera · M sound on/off';
export function setCamMode(mode) {
  state.camMode = mode;
  // mouse steering is only for the behind view
  if (mode !== 'behind' && document.pointerLockElement) document.exitPointerLock();
  localStorage.setItem('ragdollCam', mode);
  if (mode === 'behind') {
    state.camYaw = man.heading;
    camPos.set(man.x - Math.cos(state.camYaw) * 5, 2.8, man.z - Math.sin(state.camYaw) * 5);
  }
  // looking down the street you'd see blocks pop in, so the haze closes in
  scene.fog.near = mode === 'behind' ? 20 : 35;
  scene.fog.far = mode === 'behind' ? 75 : 260;
  camera.fov = mode === 'behind' ? 62 : 50;
  camera.updateProjectionMatrix();
  for (const c of liveChunks.values()) c.front.visible = mode === 'behind';
  camBtn.textContent = `Camera: ${mode === 'behind' ? 'Behind' : 'Side'} (V)`;
  helpBar.textContent = `${HELP_MOVE[mode]} · ${HELP_REST} · R play as a rat`;
}
export function toggleCam() {
  if (!state.playingRat) setCamMode(state.camMode === 'behind' ? 'side' : 'behind');
}
camBtn.addEventListener('mousedown', e => e.preventDefault());
camBtn.addEventListener('click', toggleCam);

// play as the man or as Pizza Rat: the button in the corner or the R key
export const playBtn = document.getElementById('playBtn');
export const RAT_HELP = "← → turn · ↑ scurry · ↓ back up · Space hop (up onto crates, bins and taxis) · F bite a gangster's ankle · scurry into an open manhole to see who lives down there · R back to the man · M sound on/off";
export const SEWER_HELP = '← → turn · ↑ scurry · ↓ back up · Space hop · follow the pizza signs to the lair · Space at the ladder under the light (or the Back to the street button) to climb out · F bite · R back to the man · M sound on/off';
export function setPlayingRat(on) {
  state.playingRat = on;
  state.ratPlayer = on ? rats[0] : null;
  if (on && document.pointerLockElement) document.exitPointerLock();
  for (const g of gangsters) g.cancelAttacks();
  if (on) {
    // Pizza Rat pops out a couple of steps ahead of the man (so the camera isn't inside his legs), facing the same way
    const r = state.ratPlayer;
    r.x = man.x + man.fwd.x * 2;
    r.z = Math.max(-5, Math.min(Z_MAX + 1, man.z + man.fwd.z * 2));
    r.y = 0; r.vy = 0; r.onGround = true; r.speed = 0; r.biteCooldown = 0; r.biteT = 0;
    r.heading = man.heading;
    r.input = { turn: 0, go: 0, hop: false, bite: false };
    camPos.set(r.x - Math.cos(r.heading) * 1.3, 0.45, r.z - Math.sin(r.heading) * 1.3);
    // down at rat height the street is huge and close, so a wide lens and nearer haze
    scene.fog.near = 10; scene.fog.far = 50;
    camera.fov = 72; camera.updateProjectionMatrix();
    for (const c of liveChunks.values()) c.front.visible = true;
    camBtn.textContent = "Camera: Rat's eye";
    helpBar.textContent = RAT_HELP;
  } else {
    const r = rats[0];
    leaveSewer(r);
    r.y = 0; r.state = 'idle'; r.timer = 60;
    setCamMode(state.camMode);
  }
  playBtn.textContent = `Playing: ${on ? 'Pizza Rat' : 'The Man'} (R)`;
}
playBtn.addEventListener('mousedown', e => e.preventDefault());
playBtn.addEventListener('click', () => setPlayingRat(!state.playingRat));
// only shown while the rat is down the manhole: straight back up, still playing the rat
export const streetBtn = document.getElementById('streetBtn');
streetBtn.addEventListener('mousedown', e => e.preventDefault());
streetBtn.addEventListener('click', () => { if (state.playingRat) leaveSewer(state.ratPlayer); });
for (const [id, dir] of [['skinPrev', -1], ['skinNext', 1]]) {
  const b = document.getElementById(id);
  b.addEventListener('mousedown', e => e.preventDefault()); // don't take focus, or Space would press it
  b.addEventListener('click', () => changeSkin(dir));
}

// HUD: block, street, hearts, crew left, best/KOs/time, the banner in the middle and Big Tony's health
export const hudBlock = document.getElementById('block');
export const hudStreet = document.getElementById('street');
export const hudCrew = document.getElementById('crew');
export const hudSub = document.getElementById('sub');
export const hudHearts = document.getElementById('hearts');
export const hudAmmo = document.getElementById('ammo');
export const bannerEl = document.getElementById('banner');
export const bannerTitle = document.getElementById('bannerTitle'), bannerSub = document.getElementById('bannerSub');
export const bossEl = document.getElementById('boss'), bossFill = document.getElementById('bossFill');
export const fadeEl = document.getElementById('fade');
export let shownBanner = null;
export let sewerHelpShown = false, streetBtnShown = false;

export function updateHud() {
  fadeEl.style.opacity = state.fade;
  const r = state.ratPlayer;
  const inSewer = state.playingRat && r.inSewer;
  if (inSewer !== sewerHelpShown) {
    sewerHelpShown = inSewer;
    if (state.playingRat) helpBar.textContent = inSewer ? SEWER_HELP : RAT_HELP;
  }
  const down = !!(state.playingRat && (r.inSewer || r.hole));
  if (down !== streetBtnShown) { streetBtnShown = down; streetBtn.style.display = down ? 'block' : 'none'; }
  hudBlock.textContent = `Block ${state.block}`;
  hudStreet.textContent = `Heading for ${streetName(state.block)}`;
  hudCrew.textContent = state.gateOpen ? 'Green light: cross the street →' : `Crew left: ${state.crewLeft}`;
  hudCrew.classList.toggle('go', state.gateOpen);
  const hearts = man.alive ? Math.max(0, man.hp) : 0;
  hudHearts.textContent = '♥'.repeat(hearts) + '♡'.repeat(man.maxHp - hearts);
  const w = man.weapon;
  hudAmmo.textContent = w ? `${WEAPONS[w.type].name} · ${w.ammo}/${WEAPONS[w.type].ammo}` : '';
  hudSub.textContent = `Best: ${state.bestBlocks} block${state.bestBlocks === 1 ? '' : 's'} · KOs: ${state.knockouts} · Time: ${Math.floor(state.survived)}s`;
  const b = state.banner;
  if (b !== shownBanner) {
    shownBanner = b;
    bannerEl.style.display = b ? 'block' : 'none';
    if (b) { bannerTitle.textContent = b.text; bannerSub.textContent = b.sub; }
  }
  if (b) bannerEl.style.opacity = Math.min(1, b.t / 20);
  const boss = gangsters.find(g => g.type === 'boss' && !g.leaveT);
  bossEl.style.display = boss ? 'block' : 'none';
  if (boss) bossFill.style.width = `${Math.max(0, boss.hp / boss.maxHp) * 100}%`;
}
