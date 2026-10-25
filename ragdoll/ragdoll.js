// The Ragdoll class used by the hero and the gangsters: controller, attacks, animated pose,
// Verlet ragdoll physics and meshes.
import * as THREE from 'three';
import { BODY_R, FARM, GRAVITY, HEAD, HIP_W, JOINT_GAP, JUMP_V, KICK_WINDUP, NECK, RUN_SPEED, S, SHIN, SH_W, THIGH, TORSO, UARM, lerp, rot } from './config.js';
import { scene } from './scene.js';
import { boxGeo, mat, orient } from './materials.js';
import { arena } from './arena.js';
import { dust } from './effects.js';
import { GANGSTER_LOOK, SKINS } from './looks.js';

// ---------- Ragdoll ----------
export const NAMES = ['head', 'neck', 'hip', 'kneeL', 'footL', 'kneeR', 'footR', 'elbowL', 'handL', 'elbowR', 'handR'];
// sideways offset of each joint from the body's centre plane
export const LAT = { head: 0, neck: 0, hip: 0, kneeL: HIP_W, footL: HIP_W, kneeR: -HIP_W, footR: -HIP_W, elbowL: SH_W, handL: SH_W, elbowR: -SH_W, handR: -SH_W };
export const STICKS = [
  ['head', 'neck', NECK], ['neck', 'hip', TORSO],
  ['hip', 'kneeL', THIGH], ['kneeL', 'footL', SHIN],
  ['hip', 'kneeR', THIGH], ['kneeR', 'footR', SHIN],
  ['neck', 'elbowL', UARM], ['elbowL', 'handL', FARM],
  ['neck', 'elbowR', UARM], ['elbowR', 'handR', FARM],
  ['head', 'hip', NECK + TORSO, 0.15], // keeps the spine from folding completely
].map(([a, b, len, strength = 1]) => [a, b, Math.hypot(len, LAT[a] - LAT[b]), strength]);
const ARMS = new Set(['elbowL', 'handL', 'elbowR', 'handR']);
// frames a round kick takes to spin all the way round
const ROUND_SPIN = 20;
// extra wind-up frames for a spinning backfist's turn
const BACKFIST_SPIN = 12;
// frames to swing a held crate back over the head before the throw
const THROW_WIND = 10;
// extra wind-up frames to cock an apple back behind the head
const APPLE_WIND = 5;
const UPPER = new Set(['neck', 'head', ...ARMS]);

export class Ragdoll {
  constructor(x, z, opts) {
    Object.assign(this, {
      x, z, y: 0, vx: 0, vz: 0, vy: 0, heading: 0, onGround: true, jumpsLeft: 2,
      phase: 0, run: 0, idle: Math.random() * 6, flip: 0, flipping: false,
      knocked: 0, stiffness: 0.5, invuln: 0, blocked: false,
      // heavier bodies are knocked about less; bulk widens the limbs and torso (not their length)
      mass: 1, bulk: 1, look: null,
      speed: RUN_SPEED, accel: 0.12, canFlip: true, style: 'hero',
      punchT: -1, punchHit: false, windup: 3, stun: 0, hp: 3, maxHp: 3, punchCooldown: 0,
      kickT: -1, kickHit: false, kickWindup: KICK_WINDUP, skin: 'newyorker',
      // which hand / foot the current (or last) blow uses; each new blow switches side
      punchSide: 'L', kickSide: 'R',
      // punchStyle: 'straight' or 'back' (a backfist: cocked across the body, whipped out sideways)
      punchStyle: 'straight', punches: 0,
      // holding: the crate or trash can held overhead (carry.js); throwT: the throw's timer;
      // throwRelease: set on the frame it leaves his hands
      holding: null, throwT: -1, throwRelease: false,
      // weapon: what he's armed with (weapons.js), { type: 'ak' | 'apples', ammo, cooldown }; aiming: he
      // keeps facing his aim instead of turning the way he runs
      weapon: null, aiming: false,
      // guard: 0..1 how far the fists are up; twist: shoulder turn into a punch (+ = right shoulder forward)
      guard: 0, guardT: 0, twist: 0,
      // kickStyle: 'front' or 'round'. A round kick swings the leg out to the side (sweep), tilts the
      // upper body away (tilt) and spins the whole body a full turn (spin, added to the heading)
      kickStyle: 'front', sweep: 0, tilt: 0, spin: 0, round: null,
      // where it lives (arena.js): the game's street, or whatever map has swapped itself in; Montague St
      // passes its own
      world: arena,
    }, opts);
    this.pts = {};
    for (const n of NAMES) this.pts[n] = { x, y: this.y + 1, z, px: x, py: this.y + 1, pz: z };
    this.side = new THREE.Vector3();
    this.shoulders = new THREE.Vector3();
    this.legSide = new THREE.Vector3();
    this.buildMeshes();
  }

  get alive() { return this.knocked === 0; }
  get fwd() { return { x: Math.cos(this.heading), z: Math.sin(this.heading) }; }
  // the way the body is drawn facing: the heading, turned by a round kick's spin
  get faceDir() { const a = this.heading + this.spin; return { x: Math.cos(a), z: Math.sin(a) }; }

  // kick: true for a front kick, 'round' for a spinning round kick
  control(ix, iz, jump, punch = false, kick = false) {
    if (!this.alive) {
      if (--this.knocked === 0) this.getUp();
      return;
    }
    if (this.stun > 0) { this.stun--; ix = iz = 0; jump = punch = kick = false; }
    // carrying something heavy: slower, and no fighting until it's thrown
    if (this.holding) { ix *= 0.75; iz *= 0.75; punch = kick = false; }
    if (this.rifle) punch = false; // the punch button fires it instead
    if (this.throwT >= 0) {
      this.throwT++;
      if (this.throwT === THROW_WIND + 2) this.throwRelease = true;
      if (this.throwT >= THROW_WIND + 14) this.throwT = -1;
    }
    // a new punch or kick can start once the last punch is pulling back
    const punchFree = this.punchT < 0 || this.punchT > this.punchW + 8;
    if (punch && !this.flipping && this.kickT < 0 && punchFree) {
      this.punchT = 0;
      this.punchSide = this.punchSide === 'R' ? 'L' : 'R';
      // every third punch is a backfist; holding apples, the punch is an overarm throw
      this.punchStyle = this.weapon?.type === 'apples' ? 'throw' : ++this.punches % 3 === 0 ? 'back' : 'straight';
    }
    if (kick && !this.flipping && this.kickT < 0 && punchFree) {
      this.cancelAttacks(); this.kickT = 0;
      this.kickSide = this.kickSide === 'R' ? 'L' : 'R';
      this.kickStyle = kick === 'round' ? 'round' : 'front';
    }
    if (this.punchT >= 0) {
      this.punchT++;
      // step into the punch
      const w = this.punchW;
      if (this.punchT === w && this.onGround) { this.vx += this.fwd.x * 0.035; this.vz += this.fwd.z * 0.035; }
      if (this.punchT === w + 4) this.punchHit = true;
      if (this.punchT >= w + 16) this.punchT = -1;
    }
    if (this.kickT >= 0) {
      this.kickT++;
      const w = this.kickW, round = this.kickStyle === 'round';
      // a round kick lands as the leg comes back round to the front
      if (this.kickT === w + (round ? ROUND_SPIN - 1 : 4)) this.kickHit = true;
      if (this.kickT >= w + (round ? ROUND_SPIN + 10 : 20)) this.kickT = -1;
      if (this.onGround) {
        // lunge into a front kick, otherwise keep the standing foot planted
        if (this.kickT === w && !round) { this.vx += this.fwd.x * 0.06; this.vz += this.fwd.z * 0.06; }
        ix *= 0.3; iz *= 0.3;
      }
    }
    const il = Math.hypot(ix, iz);
    if (il > 1) { ix /= il; iz /= il; }
    const a = this.onGround ? this.accel : this.accel * 0.4;
    this.vx += (ix * this.speed - this.vx) * a;
    this.vz += (iz * this.speed - this.vz) * a;
    this.x += this.vx; this.z += this.vz;
    const w = this.world;
    if (this.z < w.zMin) { this.z = w.zMin; this.vz = 0; }
    if (this.z > w.zMax) { this.z = w.zMax; this.vz = 0; }

    // obstacles block from the side unless the feet are above their top
    this.blocked = false;
    for (const b of w.boxesNear(this.x, 4, this.z)) {
      if (this.y >= b.top - w.step) continue;
      if (b.bottom !== undefined && this.y + 1.8 <= b.bottom) continue; // walking under a deck
      const cx = Math.max(b.x0, Math.min(b.x1, this.x)), cz = Math.max(b.z0, Math.min(b.z1, this.z));
      let dx = this.x - cx, dz = this.z - cz;
      const d = Math.hypot(dx, dz);
      if (d >= BODY_R) continue;
      this.blocked = true;
      if (d > 1e-6) {
        this.x = cx + dx / d * BODY_R; this.z = cz + dz / d * BODY_R;
        if (Math.abs(dx) > Math.abs(dz)) this.vx = 0; else this.vz = 0;
      } else {
        const pen = [this.x - b.x0, b.x1 - this.x, this.z - b.z0, b.z1 - this.z];
        const k = pen.indexOf(Math.min(...pen));
        if (k === 0) { this.x = b.x0 - BODY_R; this.vx = 0; }
        else if (k === 1) { this.x = b.x1 + BODY_R; this.vx = 0; }
        else if (k === 2) { this.z = b.z0 - BODY_R; this.vz = 0; }
        else { this.z = b.z1 + BODY_R; this.vz = 0; }
      }
    }

    const sp = Math.hypot(this.vx, this.vz);
    this.run = Math.min(1, sp / RUN_SPEED);
    if (sp > 0.012 && !this.aiming) {
      let diff = Math.atan2(this.vz, this.vx) - this.heading;
      diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      this.heading += diff * 0.25;
    }

    const floor = w.floorAt(this.x, this.z, this.y);
    if (this.onGround && this.y > floor + 0.01) { this.onGround = false; this.vy = 0; }

    const maxJumps = this.canFlip && !this.holding ? 2 : 1;
    if (jump && this.jumpsLeft > 2 - maxJumps) {
      this.vy = JUMP_V * (this.jumpsLeft === 2 ? 1 : 1.3);
      if (this.jumpsLeft === 1) { this.flipping = true; this.cancelAttacks(); }
      this.jumpsLeft--;
      if (this.onGround) dust(this.x, this.y, this.z, 6);
      this.onGround = false;
    }

    if (!this.onGround) {
      this.vy -= GRAVITY;
      this.y += this.vy;
      if (this.flipping) {
        this.flip += 0.16;
        if (this.flip >= Math.PI * 2) { this.flip = 0; this.flipping = false; }
      }
      if (this.vy <= 0 && this.y <= floor) {
        this.y = floor; this.vy = 0; this.onGround = true; this.jumpsLeft = 2;
        this.flip = 0; this.flipping = false;
        dust(this.x, floor, this.z, 10);
      }
    } else {
      this.y = floor;
    }
    this.phase += sp / RUN_SPEED * 0.24;
    this.idle += 0.05;
    this.stiffness = Math.min(0.5, this.stiffness + 0.01);
    if (this.invuln > 0) this.invuln--;
  }

  // how far into the wind-up and the strike a swing is, each 0..1: wind up, 4 frames out, hold, pull back
  static swing(t, w, hold, back, flipping) {
    if (t < 0 || flipping) return [0, 0];
    if (t < w) return [t / w, 0];
    if (t < w + 4) { const k = (t - w) / 4; return [1 - k, k]; }
    if (t < w + 4 + hold) return [0, 1];
    return [0, 1 - (t - w - 4 - hold) / back];
  }
  punchPose() { return Ragdoll.swing(this.punchT, this.punchW, 4, 8, this.flipping); }
  // a spinning backfist winds up for most of its turn
  get punchW() { return this.windup + (this.punchStyle === 'back' ? BACKFIST_SPIN : this.punchStyle === 'throw' ? APPLE_WIND : 0); }
  get rifle() { return this.weapon?.type === 'ak'; }
  // Spinning backfist: the body turns a full circle towards the striking hand's side, speeding up all
  // the way, with the arm folded across the chest (the wind-up). The arm whips out straight over the
  // last 4 frames, so the back of the fist lands in front of him as the turn completes.
  backfistSpin() {
    if (this.punchT < 0 || this.punchStyle !== 'back' || this.flipping) return 0;
    const u = Math.min(1, this.punchT / (this.punchW + 4));
    return (this.punchSide === 'L' ? 1 : -1) * Math.PI * 2 * u * u * (2 - u);
  }
  // A spinning round kick, in the kicking leg's own frame (spin and rel are turns towards that leg's
  // side; the caller flips them for the other leg). A little counter-turn to wind up, then the body
  // spins a full circle towards the kicking leg, speeding up all the way. The leg stays tucked for the
  // first third, unfolds as it swings round behind him, and lands straight in front just as the turn
  // completes. The follow-through carries it on out to its own side as it drops.
  // spin: body turn; rel: leg's turn about the hip from straight ahead; a, bend: the leg itself,
  // blended in by w; tilt: upper body leaning away from it
  roundPose() {
    const t = this.kickT, W = this.kickW;
    if (t < 0 || this.kickStyle !== 'round' || this.flipping) return null;
    const ease = k => k <= 0 ? 0 : k >= 1 ? 1 : k * k * (3 - 2 * k);
    if (t < W) {
      const k = t / W;
      return { spin: -0.3 * k, rel: 0, a: 0.9, bend: 1.6, w: ease(k), tilt: 0.1 * k };
    }
    const u = (t - W) / ROUND_SPIN;
    if (u <= 1) {
      const out = ease((u - 0.35) / 0.4);
      return {
        spin: -0.3 + (Math.PI * 2 + 0.3) * u * u * (2 - u), // ends still turning: the kick lands at full speed
        rel: 0.9 * (1 - Math.max(0, Math.min(1, (u - 0.4) / 0.6))),
        a: lerp(1.4, 2.0, out), bend: lerp(2.3, 0.05, out), w: 1, tilt: lerp(0.1, 0.45, out),
      };
    }
    const k = Math.min(1, (t - W - ROUND_SPIN) / 10);
    return { spin: Math.PI * 2, rel: 0.5 * k, a: 2.0, bend: lerp(0.05, 1.0, k), w: 1 - ease(k), tilt: 0.45 * (1 - k) };
  }
  kickPose() { return Ragdoll.swing(this.kickT, this.kickW, this.kickStyle === 'round' ? ROUND_SPIN - 4 : 6, 10, this.flipping); }
  get kickW() { return this.kickWindup + (this.kickStyle === 'round' ? 4 : 0); }
  // wind back over the head 0..1, then the throw out 0..1
  throwPose() { return Ragdoll.swing(this.throwT, THROW_WIND, 2, 8, false); }
  startThrow() { if (this.holding && this.throwT < 0) this.throwT = 0; }
  get attacking() { return this.punchT >= 0 || this.kickT >= 0; }
  get punchHand() { return 'hand' + this.punchSide; }
  get kickFoot() { return 'foot' + this.kickSide; }

  cancelAttacks() {
    this.punchT = this.kickT = this.throwT = -1;
    this.punchHit = this.kickHit = false;
  }

  // took a hit but is still standing: knocked back a step and dazed for a moment
  stagger(dx, dz, power = 1) {
    power /= this.mass;
    this.stun = 15 + 10 * power;
    this.cancelAttacks();
    this.vx = dx * 0.045 * power; this.vz = dz * 0.045 * power;
    const { head, neck } = this.pts;
    head.px -= dx * 0.08 * power; head.pz -= dz * 0.08 * power;
    neck.px -= dx * 0.04 * power; neck.pz -= dz * 0.04 * power;
  }

  knockOut(dx, dz, frames, power = 1) {
    power /= Math.sqrt(this.mass);
    this.knocked = frames;
    this.stiffness = 0;
    this.flip = 0; this.flipping = false;
    this.cancelAttacks(); this.stun = 0;
    for (const n of NAMES) {
      const q = this.pts[n];
      const k = (5 + Math.random() * 4) * S * power;
      q.px -= dx * k; q.pz -= dz * k;
      q.py -= (5 + Math.random() * 6) * S;
    }
  }

  getUp() {
    const h = this.pts.hip;
    const w = this.world;
    this.x = h.x; this.z = Math.max(w.zMin, Math.min(w.zMax, h.z));
    this.y = w.floorAt(this.x, this.z, h.y);
    this.vx = this.vz = this.vy = 0;
    this.onGround = true; this.jumpsLeft = 2;
    this.stiffness = 0.02;
  }

  // The animated pose, worked out in the body's own side-on plane (x forward, y down),
  // then placed in the world using the heading.
  pose() {
    const t = {};
    const airborne = !this.onGround;
    const p = this.phase;
    const run = this.run; // 0 = standing, 1 = full sprint
    // lowest when a foot is planted under the body, highest in the airborne part of each stride
    const bob = this.onGround ? Math.cos(2 * p) * 3 * S * run : 0;
    const drop = (1 - Math.cos(this.idle)) / 2 * 9 * S;
    const standH = THIGH + SHIN - 2 * S - drop;
    // knee angle that keeps the feet planted while the hips sink
    const kneeA = Math.acos(Math.min(1, standH / (THIGH + SHIN)));
    const hipH = (THIGH + SHIN - 7 * S) * run + standH * (1 - run);
    const flip = this.flip;

    // gymnast tuck: curl up early in the flip, open out just before landing
    const tuck = this.flipping ? Math.max(0, Math.min(1, this.flip / 0.8, (Math.PI * 2 - this.flip) / 1.2)) : 0;

    // spin around the middle of the tucked ball, not around the hips
    const pivot = { x: 12 * S * tuck, y: -10 * S * tuck };
    const pr = rot(pivot.x, pivot.y, flip);
    const hip = { x: pivot.x - pr.x, y: -hipH + bob + pivot.y - pr.y };
    t.hip = hip;

    const [wind, ext] = this.punchPose();
    const [kWind, kExt] = this.kickPose();
    const roundKick = this.kickStyle === 'round';
    const [tWind, tExt] = this.throwPose();
    const lean = (airborne ? lerp(0.1, 0.7, tuck) : 0.03 + (0.28 + 0.05 * Math.cos(2 * p)) * run)
      + 0.2 * ext - 0.1 * wind - 0.4 * Math.min(1, this.stun / 15) - (roundKick ? 0.1 : 0.45) * kExt - 0.15 * kWind
      - 0.2 * tWind + 0.3 * tExt;
    let d = rot(Math.sin(lean) * TORSO, -Math.cos(lean) * TORSO, flip);
    t.neck = { x: hip.x + d.x, y: hip.y + d.y };
    // head stays upright while running, tucks chin to chest in the flip
    const headLean = lerp(lean * 0.4, lean * 1.5, tuck);
    d = rot(Math.sin(headLean) * NECK, -Math.cos(headLean) * NECK, flip);
    t.head = { x: t.neck.x + d.x, y: t.neck.y + d.y };

    for (const [k, ft, off] of [['kneeL', 'footL', 0], ['kneeR', 'footR', Math.PI]]) {
      let a, bend;
      if (airborne) {
        a = lerp(off ? -0.2 : 0.9, off ? 2.05 : 2.15, tuck);
        bend = lerp(off ? 1.4 : 1.6, 2.5, tuck);
      } else {
        const lp = p + off;
        // thigh reaches further forward than back
        const runA = 0.12 + Math.sin(lp) * 0.72;
        // big knee tuck right after toe-off, slight give while the foot is planted
        const runBend = 0.2 + 1.7 * Math.pow(Math.max(0, Math.cos(lp + Math.PI / 4)), 1.5)
          + 0.3 * Math.max(0, -Math.cos(lp));
        a = runA * run + (kneeA + (off ? -0.15 : 0.15)) * (1 - run);
        bend = runBend * run + 2 * kneeA * (1 - run);
      }
      if (kWind || kExt) {
        if (k === 'knee' + this.kickSide && roundKick) {
          const r = this.round;
          if (r) { a = lerp(a, r.a, r.w); bend = lerp(bend, r.bend, r.w); }
        } else if (k === 'knee' + this.kickSide) {
          // chamber the knee up to the chest, then snap the leg straight up to head height
          a = lerp(lerp(a, 2.0, kWind), airborne ? 1.7 : 2.3, kExt); // flying kicks go out level
          bend = lerp(lerp(bend, 2.4, kWind), 0.05, kExt);
        } else if (!airborne) {
          const plant = Math.max(kWind, kExt); // standing leg straightens under him
          a = lerp(a, -0.2, plant);
          bend = lerp(bend, 0.3, plant);
        }
      }
      let v = rot(Math.sin(a) * THIGH, Math.cos(a) * THIGH, flip);
      t[k] = { x: hip.x + v.x, y: hip.y + v.y };
      const b = a - bend;
      v = rot(Math.sin(b) * SHIN, Math.cos(b) * SHIN, flip);
      t[ft] = { x: t[k].x + v.x, y: t[k].y + v.y };
    }

    // shouldering a rifle (eased out in the flip's tuck)
    const aim = this.rifle ? 1 - tuck : 0;
    for (const [e, h, off] of [['elbowL', 'handL', Math.PI], ['elbowR', 'handR', 0]]) {
      let a, bend;
      if (airborne) {
        // in the tuck the hands reach down and hold the shins
        a = lerp(Math.PI - (off ? 0.6 : 1.0), 0.55, tuck);
        bend = lerp(0.3, -1.4, tuck);
      } else {
        const s = Math.sin(p + off);
        a = (0.1 + s * 0.85) * run + (off ? 0.25 : -0.25) * (1 - run);
        // elbows pump at roughly a right angle, tighter on the forward swing
        bend = (1.5 + 0.35 * s) * run + 0.2 * (1 - run);
      }
      // fighting guard: fists up by the chin
      const gw = this.guard * (1 - tuck);
      a = lerp(a, 0.35, gw); bend = lerp(bend, 2.4, gw);
      // carrying: both hands up holding it overhead; a throw swings it back behind the head, then out
      // forwards, and the follow-through eases back to the normal pose
      const lift = this.holding ? 1 : tExt;
      if (lift) {
        a = lerp(a, lerp(lerp(2.6, 3.4, tWind), 1.9, tExt), lift);
        bend = lerp(bend, lerp(lerp(0.4, 0.7, tWind), 0.1, tExt), lift);
      }
      // rifle: right hand on the grip by the chest, left hand reaching forward under the barrel. The arms
      // only bend in their own side planes, so the bladed shoulders (twist, in step()) and a turn of
      // each arm about the neck (below) bring both hands onto the gun's line.
      if (aim) {
        a = lerp(a, off ? 1.3 : 0.05, aim);
        bend = lerp(bend, off ? 0.1 : 2.1, aim);
      }
      if (e === 'elbow' + this.punchSide && (wind || ext) && this.punchStyle === 'back') {
        // backfist: elbow up and the fist cocked by the chin (the shoulder twist carries it across to the
        // far side) while he spins, then the arm snaps straight as the shoulders unwind
        a = lerp(lerp(a, 1.3, wind), Math.PI / 2 + 0.1, ext);
        bend = lerp(lerp(bend, 1.1, wind), 0.1, ext);
      } else if (e === 'elbow' + this.punchSide && (wind || ext) && this.punchStyle === 'throw') {
        // overarm throw: the arm up with the hand cocked back behind the head, then whipped over the top
        a = lerp(lerp(a, 3.4, wind), 1.9, ext);
        bend = lerp(lerp(bend, 1.3, wind), 0.1, ext);
      } else if (e === 'elbow' + this.punchSide && (wind || ext)) {
        // draw the fist in by the chin, then drive it straight out at face height
        a = lerp(lerp(a, 0.1, wind), Math.PI / 2, ext);
        bend = lerp(lerp(bend, 2.6, wind), 0.08, ext);
      }
      let v = rot(Math.sin(a) * UARM, Math.cos(a) * UARM, flip);
      t[e] = { x: t.neck.x + v.x, y: t.neck.y + v.y };
      const b = a + bend;
      v = rot(Math.sin(b) * FARM, Math.cos(b) * FARM, flip);
      t[h] = { x: t[e].x + v.x, y: t[e].y + v.y };
    }

    const f = this.faceDir, sx = -f.z, sz = f.x;
    const kicker = ['knee' + this.kickSide, 'foot' + this.kickSide];
    const lc = Math.cos(this.tilt), ls = Math.sin(this.tilt);
    const out = {};
    for (const n of NAMES) {
      const l = t[n];
      let x = l.x, y = l.y, lat = LAT[n];
      // turn the point about a vertical axis through (cx, lat 0)
      const turn = (cx, angle) => {
        const dx = x - cx, c = Math.cos(angle), s = Math.sin(angle);
        x = cx + dx * c - lat * s;
        lat = dx * s + lat * c;
      };
      // the arms turn with the shoulders around the neck
      if (ARMS.has(n)) turn(t.neck.x, this.twist + aim * (LAT[n] > 0 ? -0.1 : 0.6));
      if (this.sweep && kicker.includes(n)) turn(hip.x, this.sweep); // the round kick's leg swings out to the side
      if (this.tilt && UPPER.has(n)) {
        // the upper body leans sideways about the hip, away from a round kick
        const u = hip.y - y;
        y = hip.y - (lat * ls + u * lc);
        lat = lat * lc - u * ls;
      }
      out[n] = { x: this.x + f.x * x + sx * lat, y: this.y - y, z: this.z + f.z * x + sz * lat };
    }
    return out;
  }

  step() {
    // fists stay up for a moment after each blow
    this.guardT = this.attacking ? 45 : Math.max(0, this.guardT - 1);
    this.guard += ((this.guardT > 0 && this.alive ? 1 : 0) - this.guard) * 0.15;
    const [wind, ext] = this.punchPose();
    // shoulders turn into a straight punch; a backfist winds them the other way round first
    const back = this.punchStyle === 'back';
    // (a backfist ends just to the hand's side of straight ahead, the fist still travelling across)
    // (a throw draws the shoulder right back, then drives it through)
    const turn = back ? 0.9 * wind - 0.25 * ext : this.punchStyle === 'throw' ? 0.5 * ext - 0.45 * wind : 0.35 * ext - 0.1 * wind;
    // with a rifle the left shoulder leads
    const twistTo = this.rifle ? -0.4 : (this.punchSide === 'R' ? 1 : -1) * turn;
    this.twist += (twistTo - this.twist) * (back ? 0.6 : 0.4);
    // round kick: spin towards the kicking leg's side, the leg sweeping round with him
    const r = this.round = this.roundPose();
    const side = this.kickSide === 'L' ? 1 : -1;
    this.spin = r ? side * r.spin : this.backfistSpin();
    this.sweep = r ? side * r.rel * r.w : 0;
    this.tilt += ((r ? side * r.tilt : 0) - this.tilt) * 0.3;
    const target = this.pose();
    const k = this.flipping || this.spin ? 0.7 : this.stiffness;
    const pts = this.pts;
    for (const n of NAMES) {
      const q = pts[n];
      const vx = (q.x - q.px) * 0.99, vy = (q.y - q.py) * 0.99, vz = (q.z - q.pz) * 0.99;
      q.px = q.x; q.py = q.y; q.pz = q.z;
      q.x += vx; q.y += vy - GRAVITY; q.z += vz;
      if (k > 0) {
        const tg = target[n];
        q.x += (tg.x - q.x) * k; q.y += (tg.y - q.y) * k; q.z += (tg.z - q.z) * k;
      }
    }
    const { zMin, zMax } = this.world;
    const solids = this.world.boxesNear(pts.hip.x, 5, pts.hip.z);
    for (let i = 0; i < 6; i++) {
      for (const [a, b, len, strength] of STICKS) {
        const p1 = pts[a], p2 = pts[b];
        const dx = p2.x - p1.x, dy = p2.y - p1.y, dz = p2.z - p1.z;
        const dist = Math.hypot(dx, dy, dz) || 1e-6;
        const diff = (dist - len) / dist * 0.5 * strength;
        p1.x += dx * diff; p1.y += dy * diff; p1.z += dz * diff;
        p2.x -= dx * diff; p2.y -= dy * diff; p2.z -= dz * diff;
      }
      for (const n of NAMES) {
        const q = pts[n];
        const r = n === 'head' ? HEAD / 2 : 0.05;
        if (q.y < r) {
          q.y = r;
          q.px += (q.x - q.px) * 0.3; q.pz += (q.z - q.pz) * 0.3; // ground friction
        }
        q.z = Math.max(zMin - 0.4, Math.min(zMax + 0.4, q.z));
        // push limbs out of obstacles along the shallowest side
        for (const o of solids) {
          // (a deck, with a bottom, can be walked under)
          const under = o.bottom === undefined ? Infinity : q.y - (o.bottom - r);
          if (q.x > o.x0 - r && q.x < o.x1 + r && q.z > o.z0 - r && q.z < o.z1 + r && q.y < o.top + r && under > 0) {
            const pen = [q.x - (o.x0 - r), o.x1 + r - q.x, q.z - (o.z0 - r), o.z1 + r - q.z, o.top + r - q.y, under];
            const m = pen.indexOf(Math.min(...pen));
            if (m === 0) q.x = o.x0 - r;
            else if (m === 1) q.x = o.x1 + r;
            else if (m === 2) q.z = o.z0 - r;
            else if (m === 3) q.z = o.z1 + r;
            else if (m === 4) { q.y = o.top + r; q.px += (q.x - q.px) * 0.3; q.pz += (q.z - q.pz) * 0.3; }
            else q.y = o.bottom - r;
          }
        }
      }
    }
  }

  setSkin(name) {
    this.skin = name;
    this.buildMeshes();
  }

  buildMeshes() {
    if (this.group) scene.remove(this.group);
    this.cup = this.bag = this.shoes = null;
    const g = this.group = new THREE.Group();
    const look = this.look || (this.style === 'gangster' ? GANGSTER_LOOK : SKINS[this.skin] || SKINS.newyorker);
    const top = mat(look.top), arms = mat(look.arms || look.top), legs = mat(look.legs);
    const part = (w, len, d, m) => {
      const mesh = new THREE.Mesh(boxGeo(w, Math.max(0.02, len - JOINT_GAP), d), m);
      mesh.scale.set(this.bulk, 1, this.bulk);
      mesh.castShadow = true; g.add(mesh);
      return mesh;
    };
    this.parts = {
      torso: part(0.24, TORSO, 0.32, top),
      uarmL: part(0.13, UARM, 0.13, arms), farmL: part(0.12, FARM, 0.12, arms),
      uarmR: part(0.13, UARM, 0.13, arms), farmR: part(0.12, FARM, 0.12, arms),
      thighL: part(0.16, THIGH, 0.16, legs), shinL: part(0.15, SHIN, 0.15, legs),
      thighR: part(0.16, THIGH, 0.16, legs), shinR: part(0.15, SHIN, 0.15, legs),
    };
    const skin = mat(look.skin);
    const head = this.parts.head = new THREE.Mesh(boxGeo(HEAD, HEAD, HEAD), skin);
    head.scale.setScalar(Math.sqrt(this.bulk));
    head.castShadow = true; g.add(head);
    const deco = (parent, w, hh, d, m, x, y, z) => {
      const mesh = new THREE.Mesh(boxGeo(w, hh, d), m);
      mesh.position.set(x, y, z); mesh.castShadow = true; parent.add(mesh);
    };
    if (look.shoes) {
      this.shoes = [0, 1].map(() => {
        const s = new THREE.Mesh(boxGeo(0.24, 0.1, 0.15), mat(look.shoes.color));
        s.scale.set(this.bulk, 1, this.bulk);
        s.castShadow = true; g.add(s);
        if (look.shoes.sole) deco(s, 0.25, 0.03, 0.16, mat(look.shoes.sole), 0, -0.04, 0);
        if (look.shoes.stripe) deco(s, 0.1, 0.025, 0.156, mat(look.shoes.stripe), -0.01, 0.005, 0);
        return s;
      });
    }
    look.decorate({
      r: this, g, head, deco, skin,
      torso: this.parts.torso, farms: [this.parts.farmL, this.parts.farmR],
      h: HEAD / 2, tl: (TORSO - JOINT_GAP) / 2, fl: (FARM - JOINT_GAP) / 2,
    });
    scene.add(g);
  }

  updateMeshes() {
    const P = this.pts, f = this.faceDir;
    this.side.set(-f.z, 0, f.x);
    const sd = this.side;
    // the side axis turned about the vertical, then tilted up on the +lat side
    const turned = (v, angle, tilt = 0) => v.set(
      (-f.z * Math.cos(angle) - f.x * Math.sin(angle)) * Math.cos(tilt), Math.sin(tilt),
      (f.x * Math.cos(angle) - f.z * Math.sin(angle)) * Math.cos(tilt));
    const sh = turned(this.shoulders, this.twist, this.tilt);
    const legL = this.sweep && this.kickSide === 'L' ? turned(this.legSide, this.sweep) : sd;
    const legR = this.sweep && this.kickSide === 'R' ? turned(this.legSide, this.sweep) : sd;
    const o = (mesh, a, b, latA = 0, s = sd) =>
      orient(mesh, a.x + s.x * latA, a.y + s.y * latA, a.z + s.z * latA, b.x, b.y, b.z, s);
    o(this.parts.torso, P.hip, P.neck, 0, sh);
    o(this.parts.uarmL, P.neck, P.elbowL, SH_W, sh); o(this.parts.farmL, P.elbowL, P.handL);
    o(this.parts.uarmR, P.neck, P.elbowR, -SH_W, sh); o(this.parts.farmR, P.elbowR, P.handR);
    o(this.parts.thighL, P.hip, P.kneeL, HIP_W, legL); o(this.parts.shinL, P.kneeL, P.footL);
    o(this.parts.thighR, P.hip, P.kneeR, -HIP_W, legR); o(this.parts.shinR, P.kneeR, P.footR);
    // head: centred on the head point, pointing away from the neck
    const hd = P.head, nk = P.neck;
    orient(this.parts.head, 2 * nk.x - hd.x, 2 * nk.y - hd.y, 2 * nk.z - hd.z, hd.x, hd.y, hd.z, sd);
    this.parts.head.position.set(hd.x, hd.y, hd.z);
    if (this.shoes) {
      [P.footL, P.footR].forEach((ft, i) => {
        this.shoes[i].position.set(ft.x + f.x * 0.04, ft.y, ft.z + f.z * 0.04);
        this.shoes[i].rotation.set(0, -this.heading - this.spin, 0);
      });
    }
    if (this.cup) {
      const hd = P.handL;
      this.cup.position.set(hd.x + f.x * 0.03, hd.y, hd.z + f.z * 0.03);
      this.cup.rotation.set(0, 0, this.alive ? 0 : Math.PI / 2);
    }
    if (this.bag) {
      // hangs just outside the right hand, clear of the leg; set aside while his hands are full
      const hd = P.handR;
      this.bag.visible = !this.weapon && !this.holding;
      this.bag.position.set(hd.x - sd.x * 0.07, Math.max(hd.y, this.alive ? 0.37 : 0.1), hd.z - sd.z * 0.07);
      this.bag.rotation.set(0, -this.heading - this.spin, this.alive ? 0 : Math.PI / 2);
    }
    this.group.visible = !(this.invuln > 0 && Math.floor(this.invuln / 5) % 2);
  }
}
