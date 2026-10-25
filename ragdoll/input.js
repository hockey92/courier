// Keyboard: held keys, one-shot actions (jump, punch, kick) and hotkeys.
import { state } from './state.js';
import { music } from './music.js';
import { changeSkin, setPlayingRat, toggleCam } from './ui.js';

// ---------- Input ----------
export const keys = {};

// one-shot actions, set on key press and used up by the next update
export const queued = { jump: false, punch: false, kick: false };

addEventListener('keydown', e => {
  music.start();
  if (e.code === 'KeyM' && !keys[e.code]) music.toggle();
  if (e.code === 'KeyC' && !keys[e.code]) changeSkin(1);
  if (e.code === 'KeyV' && !keys[e.code]) toggleCam();
  if (e.code === 'KeyR' && !keys[e.code]) setPlayingRat(!state.playingRat);
  if (e.code === 'Space' && !keys[e.code]) queued.jump = true;
  if (e.code === 'KeyF' && !keys[e.code]) queued.punch = true;
  if (e.code === 'KeyG' && !keys[e.code]) queued.kick = true;
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
  keys[e.code] = true;
});
addEventListener('keyup', e => { keys[e.code] = false; });
addEventListener('blur', () => { for (const k in keys) keys[k] = false; });
