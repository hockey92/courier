// The Ragdoll class used by the hero and the gangsters: controller, attacks, animated pose,
// Verlet ragdoll physics and meshes.
import * as THREE from 'three';
import { BODY_R, FARM, GRAVITY, HEAD, HIP_W, JOINT_GAP, JUMP_V, KICK_WINDUP, NECK, RUN_SPEED, S, SHIN, SH_W, THIGH, TORSO, UARM, Z_MAX, Z_MIN, lerp, rot } from './config.js';
import { scene } from './scene.js';
import { boxGeo, mat, orient } from './materials.js';
import { boxesNear, floorAt } from './world.js';
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
    }, opts);
    this.pts = {};
    for (const n of NAMES) this.pts[n] = { x, y: 1, z, px: x, py: 1, pz: z };
    this.side = new THREE.Vector3();
    this.buildMeshes();
  }

  get alive() { return this.knocked === 0; }
  get fwd() { return { x: Math.cos(this.heading), z: Math.sin(this.heading) }; }

  control(ix, iz, jump, punch = false, kick = false) {
    if (!this.alive) {
      if (--this.knocked === 0) this.getUp();
      return;
    }
    if (this.stun > 0) { this.stun--; ix = iz = 0; jump = punch = kick = false; }
    // a new punch or kick can start once the last punch is pulling back
    const punchFree = this.punchT < 0 || this.punchT > this.windup + 8;
    if (punch && !this.flipping && this.kickT < 0 && punchFree) this.punchT = 0;
    if (kick && !this.flipping && this.kickT < 0 && punchFree) { this.cancelAttacks(); this.kickT = 0; }
    if (this.punchT >= 0) {
      this.punchT++;
      // step into the punch
      if (this.punchT === this.windup && this.onGround) { this.vx += this.fwd.x * 0.035; this.vz += this.fwd.z * 0.035; }
      if (this.punchT === this.windup + 4) this.punchHit = true;
      if (this.punchT >= this.windup + 16) this.punchT = -1;
    }
    if (this.kickT >= 0) {
      this.kickT++;
      if (this.kickT === this.kickWindup + 4) this.kickHit = true;
      if (this.kickT >= this.kickWindup + 20) this.kickT = -1;
      if (this.onGround) {
        // lunge into the kick, otherwise keep the standing foot planted
        if (this.kickT === this.kickWindup) { this.vx += this.fwd.x * 0.06; this.vz += this.fwd.z * 0.06; }
        ix *= 0.3; iz *= 0.3;
      }
    }
    const il = Math.hypot(ix, iz);
    if (il > 1) { ix /= il; iz /= il; }
    const a = this.onGround ? this.accel : this.accel * 0.4;
    this.vx += (ix * this.speed - this.vx) * a;
    this.vz += (iz * this.speed - this.vz) * a;
    this.x += this.vx; this.z += this.vz;
    if (this.z < Z_MIN) { this.z = Z_MIN; this.vz = 0; }
    if (this.z > Z_MAX) { this.z = Z_MAX; this.vz = 0; }

    // obstacles block from the side unless the feet are above their top
    this.blocked = false;
    for (const b of boxesNear(this.x, 4)) {
      if (this.y >= b.top - 0.03) continue;
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
    if (sp > 0.012) {
      let diff = Math.atan2(this.vz, this.vx) - this.heading;
      diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      this.heading += diff * 0.25;
    }

    const floor = floorAt(this.x, this.z, this.y);
    if (this.onGround && this.y > floor + 0.01) { this.onGround = false; this.vy = 0; }

    const maxJumps = this.canFlip ? 2 : 1;
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
  punchPose() { return Ragdoll.swing(this.punchT, this.windup, 4, 8, this.flipping); }
  kickPose() { return Ragdoll.swing(this.kickT, this.kickWindup, 6, 10, this.flipping); }
  get attacking() { return this.punchT >= 0 || this.kickT >= 0; }

  cancelAttacks() {
    this.punchT = this.kickT = -1;
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
    this.x = h.x; this.z = Math.max(Z_MIN, Math.min(Z_MAX, h.z));
    this.y = floorAt(this.x, this.z, h.y);
    this.vx = this.vz = this.vy = 0;
    this.onGround = true; this.jumpsLeft = 2;
    this.stiffness = 0.02;
    this.hp = this.maxHp;
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
    const lean = (airborne ? lerp(0.1, 0.7, tuck) : 0.03 + (0.28 + 0.05 * Math.cos(2 * p)) * run)
      + 0.2 * ext - 0.1 * wind - 0.4 * Math.min(1, this.stun / 15) - 0.3 * kExt - 0.1 * kWind;
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
        if (k === 'kneeL') {
          // chamber the knee up, then snap the leg straight out at hip height
          a = lerp(lerp(a, 1.5, kWind), airborne ? 0.95 : 1.4, kExt); // flying kicks aim down
          bend = lerp(lerp(bend, 2.3, kWind), 0.05, kExt);
        } else if (!airborne) {
          const plant = Math.max(kWind, kExt); // standing leg straightens under him
          a = lerp(a, -0.1, plant);
          bend = lerp(bend, 0.3, plant);
        }
      }
      let v = rot(Math.sin(a) * THIGH, Math.cos(a) * THIGH, flip);
      t[k] = { x: hip.x + v.x, y: hip.y + v.y };
      const b = a - bend;
      v = rot(Math.sin(b) * SHIN, Math.cos(b) * SHIN, flip);
      t[ft] = { x: t[k].x + v.x, y: t[k].y + v.y };
    }

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
      if (e === 'elbowR' && (wind || ext)) {
        // cock the fist back by the shoulder, then throw it straight out
        a = lerp(lerp(a, -0.5, wind), Math.PI / 2 - 0.1, ext);
        bend = lerp(lerp(bend, 2.3, wind), 0.05, ext);
      }
      let v = rot(Math.sin(a) * UARM, Math.cos(a) * UARM, flip);
      t[e] = { x: t.neck.x + v.x, y: t.neck.y + v.y };
      const b = a + bend;
      v = rot(Math.sin(b) * FARM, Math.cos(b) * FARM, flip);
      t[h] = { x: t[e].x + v.x, y: t[e].y + v.y };
    }

    const f = this.fwd, sx = -f.z, sz = f.x;
    const out = {};
    for (const n of NAMES) {
      const l = t[n], lat = LAT[n];
      out[n] = { x: this.x + f.x * l.x + sx * lat, y: this.y - l.y, z: this.z + f.z * l.x + sz * lat };
    }
    return out;
  }

  step() {
    const target = this.pose();
    const k = this.flipping ? 0.7 : this.stiffness;
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
    const solids = boxesNear(pts.hip.x, 5);
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
        q.z = Math.max(Z_MIN - 0.4, Math.min(Z_MAX + 0.4, q.z));
        // push limbs out of obstacles along the shallowest side
        for (const o of solids) {
          if (q.x > o.x0 - r && q.x < o.x1 + r && q.z > o.z0 - r && q.z < o.z1 + r && q.y < o.top + r) {
            const pen = [q.x - (o.x0 - r), o.x1 + r - q.x, q.z - (o.z0 - r), o.z1 + r - q.z, o.top + r - q.y];
            const m = pen.indexOf(Math.min(...pen));
            if (m === 0) q.x = o.x0 - r;
            else if (m === 1) q.x = o.x1 + r;
            else if (m === 2) q.z = o.z0 - r;
            else if (m === 3) q.z = o.z1 + r;
            else { q.y = o.top + r; q.px += (q.x - q.px) * 0.3; q.pz += (q.z - q.pz) * 0.3; }
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
    this.cup = this.shoes = null;
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
    const P = this.pts, f = this.fwd;
    this.side.set(-f.z, 0, f.x);
    const sd = this.side;
    const o = (mesh, a, b, latA = 0) =>
      orient(mesh, a.x + sd.x * latA, a.y, a.z + sd.z * latA, b.x, b.y, b.z, sd);
    o(this.parts.torso, P.hip, P.neck);
    o(this.parts.uarmL, P.neck, P.elbowL, SH_W); o(this.parts.farmL, P.elbowL, P.handL);
    o(this.parts.uarmR, P.neck, P.elbowR, -SH_W); o(this.parts.farmR, P.elbowR, P.handR);
    o(this.parts.thighL, P.hip, P.kneeL, HIP_W); o(this.parts.shinL, P.kneeL, P.footL);
    o(this.parts.thighR, P.hip, P.kneeR, -HIP_W); o(this.parts.shinR, P.kneeR, P.footR);
    // head: centred on the head point, pointing away from the neck
    const hd = P.head, nk = P.neck;
    orient(this.parts.head, 2 * nk.x - hd.x, 2 * nk.y - hd.y, 2 * nk.z - hd.z, hd.x, hd.y, hd.z, sd);
    this.parts.head.position.set(hd.x, hd.y, hd.z);
    if (this.shoes) {
      [P.footL, P.footR].forEach((ft, i) => {
        this.shoes[i].position.set(ft.x + f.x * 0.04, ft.y, ft.z + f.z * 0.04);
        this.shoes[i].rotation.set(0, -this.heading, 0);
      });
    }
    if (this.cup) {
      const hd = P.handL;
      this.cup.position.set(hd.x + f.x * 0.03, hd.y, hd.z + f.z * 0.03);
      this.cup.rotation.set(0, 0, this.alive ? 0 : Math.PI / 2);
    }
    this.group.visible = !(this.invuln > 0 && Math.floor(this.invuln / 5) % 2);
  }
}
