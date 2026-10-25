// The camera rig: side view, behind view and the rat's-eye view.
import * as THREE from 'three';
import { Z_MAX, Z_MIN } from './config.js';
import { state } from './state.js';
import { camera, keyLight, stars } from './scene.js';
import { man } from './actors.js';
import { LAIR_X, SEWER_Y, sewer, sewerClamp } from './sewer.js';

export const camPos = new THREE.Vector3(man.x - 4.2, 2.4, man.z);
export const _camTarget = new THREE.Vector3();
export let ratLift = 0;

export function updateCamera() {
  const hip = man.pts.hip;
  const f = man.fwd;
  const sh = state.shake > 0.01 ? state.shake : 0;
  const jitter = () => (Math.random() - 0.5) * sh;
  if (state.playingRat) {
    // rat's-eye view: low and close behind the rat, kept on this side of the fences (or inside the sewer)
    const r = state.ratPlayer, cx = Math.cos(r.heading), cz = Math.sin(r.heading);
    state.camX += (r.x + cx * 10 - state.camX) * 0.1;
    state.camZ = r.z;
    if (r.hole) {
      // peering down the manhole after it
      camPos.lerp(_camTarget.set(r.hole.m.x - cx * 1.5, 1.1, r.hole.m.z - cz * 1.5), 0.12);
      camera.position.copy(camPos);
      camera.lookAt(r.hole.m.x, -1, r.hole.m.z);
    } else {
      // in the lair, back up and rise a little so the turtles (and what they're saying) fit in
      ratLift += ((r.inSewer && r.x - sewer.ox > LAIR_X - 2 ? 1 : 0) - ratLift) * 0.04;
      const back = 1.3 + 0.9 * ratLift;
      let tx = r.x - cx * back, tz = r.z - cz * back;
      if (r.inSewer) [tx, tz] = sewerClamp(tx, tz);
      else tz = Math.max(-5.0, Math.min(6.0, tz));
      _camTarget.set(tx, r.y + 0.45 + 0.75 * ratLift, tz);
      if (camPos.distanceToSquared(_camTarget) > 25) camPos.copy(_camTarget); // dropped in or climbed out: cut
      else camPos.lerp(_camTarget, 0.2);
      camera.position.set(camPos.x + jitter(), camPos.y + jitter(), camPos.z + jitter());
      camera.lookAt(r.x + cx * 1.5, r.y + 0.22 + 0.55 * ratLift, r.z + cz * 1.5);
    }
  } else if (state.camMode === 'behind') {
    // over the shoulder, a few metres back; camX tracks the street ahead so it gets built in time
    const cx = Math.cos(state.camYaw), cz = Math.sin(state.camYaw);
    state.camX += (hip.x + cx * 15 - state.camX) * 0.1;
    state.camZ = hip.z;
    camPos.lerp(_camTarget.set(hip.x - cx * 5, 2.8 + man.y * 0.6, Math.max(-6.2, Math.min(7.2, hip.z - cz * 5))), 0.15);
    camera.position.set(camPos.x + jitter(), camPos.y + jitter(), camPos.z + jitter());
    camera.lookAt(hip.x + cx * 4, 1.4 + man.y * 0.5, hip.z + cz * 4);
  } else {
    state.camX += (hip.x + f.x * 2 - state.camX) * 0.06;
    state.camZ += (Math.max(Z_MIN, Math.min(Z_MAX, hip.z)) - state.camZ) * 0.06;
    camera.position.set(state.camX + jitter(), 6.5 + jitter(), state.camZ * 0.4 + 13);
    camera.lookAt(state.camX, 1.6, state.camZ * 0.6 - 1.5);
  }
  const focus = state.playingRat ? state.ratPlayer : hip;
  const fy = state.playingRat && state.ratPlayer.inSewer ? SEWER_Y : 0;
  keyLight.position.set(focus.x - 7, fy + 15, focus.z + 9);
  keyLight.target.position.set(focus.x, fy, focus.z);
  stars.position.x = state.camX;
}
