// Keyboard and mouse: held keys, one-shot actions (jump, punch, kick, round kick, pick up / throw),
// hotkeys, and fighting with mouse clicks aimed at the cursor (held down for the rifle's full auto).
import * as THREE from 'three';
import { state } from './state.js';
import { camera, renderer } from './scene.js';
import { music } from './music.js';
import { changeSkin, setPlayingRat, toggleCam } from './ui.js';

// ---------- Input ----------
export const keys = {};

// one-shot actions, set on key press and used up by the next update
// aim: the spot on the street a mouse attack was clicked at, { x, z }, or null for a key press
export const queued = { jump: false, punch: false, kick: false, round: false, grab: false, aim: null };

addEventListener('keydown', e => {
  music.start();
  if (e.code === 'KeyM' && !keys[e.code]) music.toggle();
  if (e.code === 'KeyC' && !keys[e.code]) changeSkin(1);
  if (e.code === 'KeyV' && !keys[e.code]) toggleCam();
  if (e.code === 'KeyR' && !keys[e.code]) setPlayingRat(!state.playingRat);
  if (e.code === 'Space' && !keys[e.code]) queued.jump = true;
  if (e.code === 'KeyF' && !keys[e.code]) queued.punch = true;
  if (e.code === 'KeyG' && !keys[e.code]) queued.kick = true;
  if (e.code === 'KeyH' && !keys[e.code]) queued.round = true;
  if (e.code === 'KeyE' && !keys[e.code]) queued.grab = true;
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
  keys[e.code] = true;
});
addEventListener('keyup', e => { keys[e.code] = false; });
addEventListener('blur', () => { for (const k in keys) keys[k] = false; mouse.fire = false; });

// ---------- Mouse ----------
// left click punch (or throw what he's holding), right click kick, middle or Shift+left click round kick;
// only clicks on the game itself, not on the buttons over it.
// In the behind view the first click grabs the mouse (pointer lock) and moving it left/right turns
// him and the camera; Esc lets go. While it's grabbed there's no cursor, so attacks go where he faces.
// turn: mouse-look turn (radians) built up since the last update; fire: the left button is held down
// (full auto with the rifle); aim: where the cursor points at chest height (so pointing at someone's body
// aims at him, not at the street behind him), or null; idle: updates since the mouse last moved or clicked
export const mouse = { turn: 0, fire: false, aim: null, idle: 1e9 };
export const mouseGrabbed = () => document.pointerLockElement === renderer.domElement;
const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
const street = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), chest = new THREE.Plane(new THREE.Vector3(0, 1, 0), -1.3);
const hit = new THREE.Vector3();
function pointAt(e, plane) {
  if (mouseGrabbed()) return null;
  ndc.set(e.clientX / innerWidth * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
  ray.setFromCamera(ndc, camera);
  return ray.ray.intersectPlane(plane, hit) ? { x: hit.x, z: hit.z } : null;
}
renderer.domElement.addEventListener('mousedown', e => {
  if (state.camMode === 'behind' && !state.playingRat && !mouseGrabbed()) {
    renderer.domElement.requestPointerLock?.();
    return;
  }
  const action = e.button === 0 ? (e.shiftKey ? 'round' : 'punch') : e.button === 2 ? 'kick' : e.button === 1 ? 'round' : null;
  if (!action) return;
  e.preventDefault(); // no middle-click scrolling
  queued[action] = true;
  queued.aim = pointAt(e, street);
  mouse.aim = pointAt(e, chest); mouse.idle = 0;
  if (action === 'punch') mouse.fire = true;
});
addEventListener('mouseup', e => { if (e.button === 0) mouse.fire = false; });
addEventListener('mousemove', e => {
  if (mouseGrabbed()) mouse.turn += e.movementX * 0.0035;
  else if (e.target === renderer.domElement) { mouse.aim = pointAt(e, chest); mouse.idle = 0; }
});
renderer.domElement.addEventListener('contextmenu', e => e.preventDefault());
