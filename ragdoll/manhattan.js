// Lower Manhattan, Canal St down to the Battery (built in manhattanworld.js), with the game played on it as in
// Brooklyn Heights (heights.js): the hero, gangsters and weapons, a run from turf to turf (heightsrun.js),
// zombie night, traffic (yellow cabs, NYPD cars, USPS vans) he can carjack, bikes, people out walking, an
// over-the-shoulder or free camera, places to jump to, a minimap; and the Brooklyn Bridge over to Brooklyn Heights.
import * as THREE from 'three';
import { camera, hemi, keyLight, renderer, scene, stars, sunsetRim } from './scene.js';
import { RUN_SPEED } from './config.js';
import { addBox, mat } from './materials.js';
import { arena } from './arena.js';
import { state } from './state.js';
import { SKINS, SKIN_ORDER } from './looks.js';
import { updateDust } from './effects.js';
import { cars as gameTraffic } from './traffic.js';
import { music } from './music.js';
import { gangsters, man } from './actors.js';
import { checkHits, gangsterBrain, renderGangs, resolvePunches, updateGangs } from './combat.js';
import { renderBottles } from './bottles.js';
import { putDown, renderWeapons, updateWeapons } from './weapons.js';
import { Batch, colorMat } from './batch.js';
import { CAR_COLORS, carGeo } from './streetkit.js';
import {
  BR, CURB, WORLD, along, bridgeAt, bridgeLocal, buildManhattan, deckY, drawMiniMap, inSolid, movers, onDeck, onLand,
  outdoors, parked, placeName, props, sidewalkPaths, spotNear as streetSpot, ways,
} from './manhattanworld.js';
import { createMinimap } from './heightsmini.js';
import { createRun, updateHud } from './heightsrun.js';
import { createCars } from './heightscars.js';
import { createBikes } from './heightsbike.js';
import { horde } from './zombies.js';

// the fight happens here now, not on the game's street
Object.assign(arena, WORLD);
// the ragdoll brings the game's street with it: its traffic doesn't belong here, its music stays off until M
for (const c of gameTraffic) scene.remove(c.g);
music.toggle();
state.bestBlocks = +localStorage.getItem('ragdollBestTurfsManhattan') || 0;
horde.bestKey = 'ragdollBestManhattanWave';
state.bestWave = +localStorage.getItem(horde.bestKey) || 0;

// ---------- A clear October afternoon ----------
{
  const c = document.createElement('canvas'); c.width = 2; c.height = 512;
  const g = c.getContext('2d');
  const gr = g.createLinearGradient(0, 0, 0, 512);
  gr.addColorStop(0, '#3f78c2'); gr.addColorStop(0.5, '#8db5de'); gr.addColorStop(0.85, '#e7dccb'); gr.addColorStop(1, '#f4d7b0');
  g.fillStyle = gr; g.fillRect(0, 0, 2, 512);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  scene.background = t;
}
scene.fog = new THREE.Fog(0xd3dbe2, 400, 3200);
hemi.color.set(0xe2ecff); hemi.groundColor.set(0x6d6250); hemi.intensity = 1.55;
keyLight.color.set(0xffddb0); keyLight.intensity = 2.5;
keyLight.shadow.normalBias = 0.04;
Object.assign(keyLight.shadow.camera, { left: -60, right: 60, top: 60, bottom: -60, near: 1, far: 1000 });
keyLight.shadow.camera.updateProjectionMatrix();
const SUN = new THREE.Vector3(-0.6, 0.55, 0.58).normalize();
sunsetRim.intensity = 0.3;
stars.visible = false;
camera.far = 6000; camera.updateProjectionMatrix();

const world = new THREE.Group();
scene.add(world);
buildManhattan(world);

// ---------- The game's hero, in whichever skin was last picked ----------
const hero = man;
const queued = { jump: false, punch: false, kick: false, grab: false };
function place(r, x, z, y, heading) {
  const sx = x - r.x, sz = z - r.z, sy = y - r.y;
  Object.assign(r, { x, z, y, vx: 0, vz: 0, vy: 0, onGround: true, jumpsLeft: 2 });
  if (heading !== undefined) r.heading = heading;
  for (const q of Object.values(r.pts)) { q.x += sx; q.px += sx; q.z += sz; q.pz += sz; q.y += sy; q.py += sy; }
}
// a clear spot near (x, z) at street level, or up on the bridge's deck
function spotNear(x, z) {
  const [a, l] = bridgeLocal(x, z);
  if (onDeck(a, l) && deckY(a) > 3) return bridgeAt(a, 0, deckY(a));
  return streetSpot(x, z);
}
// places to jump to with the number keys
const PLACES = [
  { name: 'Wall St & Broadway', x: -17, z: 22 },
  { name: 'The 9/11 Memorial', x: -376, z: -305 },
  { name: 'Bowling Green', x: -60, z: 330 },
  { name: 'City Hall', x: 87, z: -660 },
  { name: 'Stone St', x: 214, z: 299 },
  { name: 'Brooklyn Bridge', bridge: 250 },
  { name: 'The Battery', x: -180, z: 580 },
  { name: 'South Street Seaport', x: 602, z: -220 },
];
let walkYaw = 0, snapCam = true;
// facing whichever way the open ground runs furthest
function openWay(x, z) {
  let heading = 0, best = -1;
  for (let k = 0; k < 4; k++) {
    const dx = Math.cos(k * Math.PI / 2) * 2, dz = Math.sin(k * Math.PI / 2) * 2;
    let n = 0;
    while (n < 40 && outdoors(x + dx * (n + 1), z + dz * (n + 1)) && !inSolid(x + dx * (n + 1), 1, z + dz * (n + 1))) n++;
    if (n > best) { best = n; heading = k * Math.PI / 2; }
  }
  return heading;
}
function goTo(x, z, heading) {
  const s = spotNear(x, z);
  if (!s) return false;
  place(hero, s[0], s[2], s[1], heading ?? openWay(s[0], s[2]));
  walkYaw = hero.heading; snapCam = true;
  return true;
}
// up on the bridge's boardwalk, a metres along it
function toBridge(a, heading) {
  const [x, y, z] = bridgeAt(a, 0, deckY(a));
  place(hero, x, z, y, heading);
  walkYaw = heading; snapCam = true;
}
const toPlace = p => p.bridge ? toBridge(p.bridge, BR.heading) : goTo(p.x, p.z);
// back from Brooklyn Heights over the bridge (heights.html sends him here), or Wall St
if (new URLSearchParams(location.search).get('from') === 'brooklyn') toBridge(BR.end - 30, BR.heading + Math.PI);
else toPlace(PLACES[0]);

const whoEl = document.getElementById('who'), whereEl = document.getElementById('where'), helpEl = document.getElementById('help');
const promptEl = document.getElementById('prompt');
function showSkin() { whoEl.textContent = `Walking as: ${SKINS[hero.skin].name} (C to change)`; }
function nextSkin() {
  hero.setSkin(SKIN_ORDER[(SKIN_ORDER.indexOf(hero.skin) + 1) % SKIN_ORDER.length]);
  localStorage.setItem('ragdollSkin', hero.skin);
  showSkin();
}
function whereIs(x, z, y) {
  const [a, l] = bridgeLocal(x, z);
  if (onDeck(a, l) && y > 1) return 'Brooklyn Bridge';
  return placeName(x, z);
}
// the railings keep him on the bridge deck; walking into the Manhattan tower takes him across to Brooklyn Heights
let leaving = false;
function onTheBridge() {
  const [a, l] = bridgeLocal(hero.x, hero.z);
  if (a < 0 || a > BR.end + 2 || Math.abs(l) > BR.half + 1.5 || hero.y < 1.5 || hero.y < deckY(a) - 1) return;
  if (!leaving && a > BR.end - 3) {
    leaving = true;
    whereEl.textContent = 'Over the river to Brooklyn…';
    location.href = 'heights.html?from=manhattan';
  }
  const lim = BR.half - 0.4;
  if (Math.abs(l) <= lim) return;
  const dl = Math.sign(l) * lim - l, dx = -BR.uz * dl, dz = BR.ux * dl;
  hero.x += dx; hero.z += dz;
  for (const q of Object.values(hero.pts)) { q.x += dx; q.px += dx; q.z += dz; q.pz += dz; }
}

// ---------- The run: turf to turf, the game's gangsters and weapons ----------
const TURFS = [
  { name: 'Bowling Green', x: -60, z: 330 },
  { name: 'Wall St', x: -17, z: 22 },
  { name: 'City Hall Park', x: 60, z: -640 },
  { name: 'the 9/11 Memorial', x: -376, z: -305 },
  { name: 'Stone St', x: 214, z: 299 },
  { name: 'Zuccotti Park', x: -102, z: -158 },
  { name: 'the Battery', x: -180, z: 580 },
  { name: 'South Street Seaport', x: 602, z: -220 },
  { name: 'Trinity Church', x: -95, z: 30 },
  { name: 'Tribeca', x: -508, z: -1299 },
];
const game = createRun({
  spotNear, place, outdoors, turfList: TURFS, bestTurfsKey: 'ragdollBestTurfsManhattan',
  home: { ...PLACES[0], name: 'Wall St', heading: openWay(PLACES[0].x, PLACES[0].z) },
});
arena.spawnAt = game.spawnAt;
arena.pickupAt = game.pickupAt;
arena.weapons = ['apples'];
// zombie night's apples: a clear spot near there at about his level, or at his feet
arena.dropNear = (x, z) => {
  const s = spotNear(x, z);
  return s && Math.abs(s[1] - hero.y) < 2.5 ? { x: s[0], y: s[1], z: s[2] } : { x: hero.x, y: hero.y, z: hero.z };
};
game.start(1);
// manhattan.html?zombies starts on zombie night
if (new URLSearchParams(location.search).has('zombies')) game.setZombies(true);

// ---------- Traffic: yellow cabs, NYPD cars, USPS vans and everyone else, round the real streets ----------
// each drives a way (manhattanworld.js) in its right-hand lane; at the end it carries on along another way that
// starts or ends there, or turns round if there's none
const plain = colorMat();
function model(parts) {
  const b = new Batch(false);
  for (const [x0, x1, y0, y1, z0, z1, color] of parts) b.box(x0, x1, y0, y1, z0, z1, { mat: plain, color });
  return b.merged();
}
const WHEELS = (x, w) => [-x, x].flatMap(u => [-w, w].map(l => [u - 0.36, u + 0.36, 0, 0.72, l - 0.16, l + 0.16, '#151515']));
const cruiser = (paint, stripe, roof) => [
  [-2.5, 2.5, 0.35, 1.1, -1, 1, paint],
  [-2.45, 2.45, 0.62, 0.82, -1.02, 1.02, stripe],
  [-1.9, 1.1, 1.1, 1.72, -0.92, 0.92, '#1c232b'],
  [-1.85, 1, 1.72, 1.8, -0.9, 0.9, roof],
  [2.45, 2.6, 0.3, 0.62, -0.98, 0.98, '#202022'], [-2.6, -2.45, 0.3, 0.62, -0.98, 0.98, '#202022'],
  [2.48, 2.52, 0.82, 1, -0.85, -0.5, '#fff6d0'], [2.48, 2.52, 0.82, 1, 0.5, 0.85, '#fff6d0'],
  [-2.52, -2.48, 0.82, 1, -0.85, -0.55, '#c0202a'], [-2.52, -2.48, 0.82, 1, 0.55, 0.85, '#c0202a'],
  ...WHEELS(1.55, 0.88),
];
const NYPD = { len: 5, wid: 2, top: 1.8, speed: 0.2, n: 50, geo: model(cruiser('#f4f4f2', '#1d4aa0', '#f4f4f2')) };
const TAXI = {
  len: 5, wid: 2, top: 1.8, speed: 0.22, n: 140,
  geo: model([...cruiser('#f2c230', '#1c1c1e', '#f2c230'), [-0.55, 0.15, 1.8, 2.1, -0.5, 0.5, '#f4f4f2']]),   // the roof light
};
const USPS = {
  len: 5.6, wid: 2.1, top: 2.6, speed: 0.16, n: 40,
  geo: model([
    [-2.8, 2.2, 0.35, 2.6, -1.05, 1.05, '#f2f2ee'],             // the box
    [2.2, 2.8, 0.35, 1.3, -1, 1, '#f2f2ee'],                    // the hood
    [1.9, 2.24, 1.4, 2.35, -0.96, 0.96, '#1c232b'],             // the windshield
    [1.2, 2.2, 1.45, 2.3, -1.07, 1.07, '#1c232b'],              // the cab's side windows
    [-2.75, 1.15, 0.78, 0.92, -1.07, 1.07, '#c8202f'],          // red and blue stripes down the sides
    [-2.75, 1.15, 0.94, 1.14, -1.07, 1.07, '#2b4a9a'],
    [-1.2, 0.2, 1.4, 2.1, -1.08, 1.08, '#2b4a9a'],              // the eagle's patch
    [2.75, 2.9, 0.3, 0.6, -1, 1, '#202022'], [-2.95, -2.8, 0.3, 0.6, -1, 1, '#202022'],
    [2.78, 2.82, 0.9, 1.1, -0.9, -0.6, '#fff6d0'], [2.78, 2.82, 0.9, 1.1, 0.6, 0.9, '#fff6d0'],
    ...WHEELS(1.7, 0.92),
  ]),
};
const SEDAN = { len: 4.4, wid: 1.8, top: 1.6, speed: 0.19, n: 120, geo: carGeo, colored: true };
const TYPES = [TAXI, NYPD, USPS, SEDAN];
const red = new THREE.MeshStandardMaterial({ color: '#ff3030', emissive: '#ff0000' });
const blue = new THREE.MeshStandardMaterial({ color: '#3060ff', emissive: '#0030ff' });
const barGeo = z => new THREE.BoxGeometry(0.34, 0.14, 0.7).translate(-0.3, 1.87, z);
const fleet = [];
const rand = Math.random;
// a quarter of each start out round Wall St, where he does
const roomy = ways.filter(w => w.total > 60), downtown = roomy.filter(w => Math.hypot(w.p[0], w.p[1]) < 220);
for (const type of TYPES) {
  for (let k = 0; k < type.n; k++) {
    const pool = k < type.n / 4 ? downtown : roomy, way = pool[Math.floor(rand() * pool.length)];
    const v = {
      type, way, s: rand() * way.total, dir: rand() < 0.5 ? 1 : -1, v: 0, x: 0, z: 0, h: 0, taken: false,
      color: type.colored ? CAR_COLORS[Math.floor(rand() * CAR_COLORS.length)] : null,
      box: { x0: 0, x1: 0, z0: 0, z1: 0, top: type.top },
    };
    v.cruise = type.speed * (0.8 + rand() * 0.4);
    movers.push(v.box);
    fleet.push(v);
  }
}
const meshes = new Map(TYPES.map(t => [t, new THREE.InstancedMesh(t.geo, t.colored ? colorMat() : plain, t.n)]));
const bars = [red, blue].map((m, i) => new THREE.InstancedMesh(barGeo(i ? 0.36 : -0.36), m, NYPD.n));
for (const m of [...meshes.values(), ...bars]) { m.castShadow = true; m.frustumCulled = false; world.add(m); }
{
  const c = new THREE.Color();
  fleet.filter(v => v.type.colored).forEach((v, i) => meshes.get(SEDAN).setColorAt(i, c.set(v.color)));
}
const spot = {};
function placeVehicle(v) {
  along(v.way, v.s, spot);
  const h = v.dir > 0 ? spot.h : spot.h + Math.PI, fx = Math.cos(h), fz = Math.sin(h), lane = Math.min(v.way.w / 4, 3.5);
  v.x = spot.x - fz * lane; v.z = spot.z + fx * lane;
  // the heading eases round the bends
  const d = Math.atan2(Math.sin(h - v.h), Math.cos(h - v.h));
  v.h = v.v ? v.h + d * 0.25 : h;
  const c = Math.abs(Math.cos(v.h)), sn = Math.abs(Math.sin(v.h)), L = v.type.len / 2, W = v.type.wid / 2;
  Object.assign(v.box, { x0: v.x - c * L - sn * W, x1: v.x + c * L + sn * W, z0: v.z - sn * L - c * W, z1: v.z + sn * L + c * W });
}
fleet.forEach(placeVehicle);
// the traffic keeps up with him too: anything left FAR metres behind turns up again on a street round him, out
// past SEEN metres where it's hard to spot it, a few a step; when he jumps somewhere they all do
const FAR = 260, SEEN = 100, SLOTS = [];
for (const way of ways) for (let s = Math.min(10, way.total / 2); s < way.total; s += 16) { along(way, s, spot); SLOTS.push({ way, s, x: spot.x, z: spot.z }); }
let trafficAt = null;
function keepTrafficNear() {
  const jumped = trafficAt && Math.hypot(hero.x - trafficAt[0], hero.z - trafficAt[1]) > 30;
  trafficAt = [hero.x, hero.z];
  let near = null, moved = 0;
  for (const v of fleet) {
    if (v.taken || (!jumped && moved >= 4) || (!jumped && Math.hypot(v.x - hero.x, v.z - hero.z) < FAR)) continue;
    near ??= SLOTS.filter(q => { const d = Math.hypot(q.x - hero.x, q.z - hero.z); return d < FAR - 20 && d > (jumped ? 25 : SEEN); });
    if (!near.length) return;
    const q = near[Math.floor(rand() * near.length)];
    if (fleet.some(o => o !== v && !o.taken && Math.hypot(o.x - q.x, o.z - q.z) < 9)) continue;
    Object.assign(v, { way: q.way, s: q.s, dir: rand() < 0.5 ? 1 : -1, v: 0 });
    placeVehicle(v);
    moved++;
  }
}
function driveTraffic() {
  keepTrafficNear();
  const people = [hero, ...gangsters, ...cars.mine, ...bikes.bikes];
  for (const v of fleet) {
    if (v.taken) continue;   // he's driving it now (heightscars.js)
    // slowing for the vehicle ahead, or anyone (him, a gangster, a car he's left, a bike) in the lane in front
    const fx = Math.cos(v.h), fz = Math.sin(v.h);
    let gap = Infinity;
    for (const o of fleet) {
      if (o === v || o.taken) continue;
      const dx = o.x - v.x, dz = o.z - v.z, ahead = dx * fx + dz * fz;
      if (ahead > 0 && ahead < 20 && Math.abs(dz * fx - dx * fz) < 1.6) gap = Math.min(gap, ahead - (v.type.len + o.type.len) / 2);
    }
    for (const p of people) {
      const dx = p.x - v.x, dz = p.z - v.z, ahead = dx * fx + dz * fz;
      if (ahead > 0 && ahead < 20 && Math.abs(dz * fx - dx * fz) < 1.8 && p.y < 3) gap = Math.min(gap, ahead - v.type.len / 2 - 0.6);
    }
    const want = gap < 2 ? 0 : gap < 12 ? v.cruise * (gap - 2) / 10 : v.cruise;
    v.v += (want - v.v) * 0.08;
    v.s += v.v * v.dir;
    // off the end: on along the next way, or round
    const over = v.dir > 0 ? v.s - v.way.total : -v.s;
    if (over > 0) {
      const links = v.way.links[v.dir > 0 ? 1 : 0];
      if (links.length) {
        const next = links[Math.floor(rand() * links.length)];
        v.way = next.way; v.dir = next.dir; v.s = next.dir > 0 ? over : next.way.total - over;
      } else { v.dir = -v.dir; v.s = v.dir > 0 ? 0 : v.way.total; }
    }
    placeVehicle(v);
  }
}
const vObj = new THREE.Object3D(), ZERO = new THREE.Matrix4().makeScale(0, 0, 0);
function renderTraffic(t) {
  const n = new Map(TYPES.map(type => [type, 0]));
  for (const v of fleet) {
    vObj.position.set(v.x, 0, v.z);
    vObj.rotation.set(0, -v.h, 0);
    vObj.updateMatrix();
    const i = n.get(v.type), m = v.taken ? ZERO : vObj.matrix;
    n.set(v.type, i + 1);
    meshes.get(v.type).setMatrixAt(i, m);
    if (v.type === NYPD) for (const b of bars) b.setMatrixAt(i, m);
  }
  for (const m of [...meshes.values(), ...bars]) m.instanceMatrix.needsUpdate = true;
  // the light bars flash red, blue, red, blue
  const on = Math.floor(t * 6) % 2;
  red.emissiveIntensity = on ? 2.5 : 0.1;
  blue.emissiveIntensity = on ? 0.1 : 2.5;
}
// once he's taken one it's a mesh of its own, light bar and all
function trafficMesh(v) {
  const g = new THREE.Group(), m = v.type.colored ? props.carMat.clone() : plain;
  if (v.type.colored) m.color.set(v.color);
  g.add(new THREE.Mesh(v.type.geo, m));
  if (v.type === NYPD) g.add(new THREE.Mesh(barGeo(-0.36), red), new THREE.Mesh(barGeo(0.36), blue));
  g.traverse(o => { if (o.isMesh) o.castShadow = o.receiveShadow = true; });
  return g;
}
const cars = createCars({ traffic: fleet, place, movers, parked, props, trafficMesh, pose: v => ({ x: v.x, y: 0, z: v.z, heading: v.h, speed: v.v }) });
// fixed gear bikes locked up round the neighbourhood, each facing the way the open ground runs: [x, z]
const BIKE_RACKS = [[-10, 30], [60, -640], [-50, 320], [-150, 560], [590, -210], [-380, -430], [-500, -1290], [-95, -150]];
const bikes = createBikes({
  parent: world, place,
  racks: BIKE_RACKS.map(([x, z]) => { const s = streetSpot(x, z); return s && [s[0], s[1], s[2], openWay(s[0], s[2])]; }).filter(Boolean),
});

// ---------- People out walking ----------
function buildPerson(top, legs, skinC, hair) {
  const p = new THREE.Group();
  const skin = mat(skinC), shoe = mat('#1d1d1f');
  addBox(p, 0.26, 0.62, 0.42, mat(top), 0, 1.22, 0);
  addBox(p, 0.22, 0.24, 0.2, skin, 0.01, 1.66, 0);
  addBox(p, 0.24, 0.08, 0.22, mat(hair), -0.01, 1.8, 0);
  const limbs = [];
  for (const side of [-1, 1]) {
    const leg = new THREE.Group(); leg.position.set(0, 0.92, side * 0.1);
    addBox(leg, 0.16, 0.86, 0.16, mat(legs), 0, -0.43, 0);
    addBox(leg, 0.28, 0.08, 0.14, shoe, 0.05, -0.88, 0);
    const arm = new THREE.Group(); arm.position.set(0, 1.48, side * 0.27);
    addBox(arm, 0.12, 0.6, 0.12, mat(top), 0, -0.3, 0);
    addBox(arm, 0.1, 0.1, 0.1, skin, 0, -0.64, 0);
    p.add(leg, arm);
    limbs.push({ leg, arm, side });
  }
  p.traverse(m => { if (m.isMesh) m.castShadow = true; });
  world.add(p);
  return { p, limbs, phase: Math.random() * 6 };
}
const TOPS = ['#7a5434', '#e8e6e1', '#2f3a4f', '#9a2e2e', '#d6c39a', '#3d4d3a', '#c46a2c', '#5a5f7a', '#1e1e22', '#8fb0c9', '#1e1e22', '#33363d'];
const LEGS = ['#2a2c30', '#262a33', '#3a3a3a', '#41444a', '#55606e', '#6b5a48'];
const SKIN_TONES = ['#c99a7a', '#d9ad8c', '#8a5f45', '#6e4a36', '#e0b896', '#a87454'];
const HAIR = ['#2a201a', '#4a3320', '#8a6a3a', '#111', '#9a9590'];
const pick = a => a[Math.floor(Math.random() * a.length)];
// a crowd that keeps up with him: CROWD people, each walking up and down a sidewalk ([x0, z0, x1, z1]) within
// NEAR metres of him, a little to one side or the other so they pass each other. Anyone left further behind
// turns up on another sidewalk round him, out of arm's reach; when he jumps somewhere (1–8, the map) they all do
const PATHS = sidewalkPaths().map(([x0, z0, x1, z1]) => ({ x0, z0, x1, z1, len: Math.hypot(x1 - x0, z1 - z0) }));
const CROWD = 220, NEAR = 140;
function pathsNear() {
  const list = PATHS.filter(p => Math.hypot((p.x0 + p.x1) / 2 - hero.x, (p.z0 + p.z1) / 2 - hero.z) < NEAR);
  list.total = list.reduce((a, p) => a + p.len, 0);
  return list;
}
// somewhere along the sidewalks in pool, every metre of them as likely as any other
function putOnSidewalk(w, pool, minD) {
  for (let k = 0; k < 8; k++) {
    let r = Math.random() * pool.total, i = 0;
    while (i < pool.length - 1 && r > pool[i].len) r -= pool[i++].len;
    const { x0, z0, x1, z1, len } = pool[i], dx = x1 - x0, dz = z1 - z0, o = (Math.random() - 0.5) * 1.4;
    Object.assign(w, { x0: x0 - dz / len * o, z0: z0 + dx / len * o, dx, dz, len, t: Math.random(), dir: Math.random() < 0.5 ? 1 : -1 });
    if (Math.hypot(w.x0 + dx * w.t - hero.x, w.z0 + dz * w.t - hero.z) >= minD) return;
  }
}
const startPaths = pathsNear().length ? pathsNear() : Object.assign([...PATHS], { total: PATHS.reduce((a, p) => a + p.len, 0) });
const walkers = Array.from({ length: CROWD }, () => {
  const w = { ...buildPerson(pick(TOPS), pick(LEGS), pick(SKIN_TONES), pick(HAIR)), speed: 1 + Math.random() * 0.5 };
  putOnSidewalk(w, startPaths, 0);
  return w;
});
let crowdAt = null;   // where he was last frame
function renderWalkers(dt, t) {
  const jumped = crowdAt && Math.hypot(hero.x - crowdAt[0], hero.z - crowdAt[1]) > 30;
  crowdAt = [hero.x, hero.z];
  let near = null;
  for (const w of walkers) {
    w.t += w.dir * w.speed * dt / w.len;
    if (w.t > 1) { w.t = 1; w.dir = -1; } else if (w.t < 0) { w.t = 0; w.dir = 1; }
    let x = w.x0 + w.dx * w.t, z = w.z0 + w.dz * w.t;
    if (jumped || Math.hypot(x - hero.x, z - hero.z) > NEAR + 15) {
      near ??= pathsNear();
      if (near.length) { putOnSidewalk(w, near, jumped ? 6 : 40); x = w.x0 + w.dx * w.t; z = w.z0 + w.dz * w.t; }
    }
    const far = Math.hypot(x - hero.x, z - hero.z) > NEAR + 15;
    w.p.visible = !far;
    if (far) continue;
    const s = t * w.speed * 3.2 + w.phase;
    w.p.position.set(x, CURB + Math.abs(Math.sin(s)) * 0.03, z);
    w.p.rotation.y = -Math.atan2(w.dz * w.dir, w.dx * w.dir);
    for (const { leg, arm, side } of w.limbs) {
      leg.rotation.z = Math.sin(s) * 0.45 * side;
      arm.rotation.z = -Math.sin(s) * 0.35 * side;
    }
  }
}

// ---------- Cameras: over the hero's shoulder ('walk'), or free ('look') ----------
const view = { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, fov: 60 };
const HELP = {
  walk: '↑ ↓ / W S run · ← → / A D or drag to turn · Shift sprint · wheel zoom · Space jump (again for a flip)<br>F punch (or throw apples, hold it) · G kick · H round kick · E get in / out of a car, on / off a bike (or put the apples down) · Tab map (click to go there) · 1–8 places · C skin · M music · V free camera · Z zombie night<br>Walk the Brooklyn Bridge (6) out to its tower to cross to Brooklyn Heights',
  look: 'Drag to look · wheel to zoom · W A S D / arrows to fly · Shift faster · Q E down / up<br>Tab map · 1–8 places · V back to walking',
};
let mode = 'walk', walkDist = 6;
const camPos = new THREE.Vector3(), camTarget = new THREE.Vector3(), eye = new THREE.Vector3(), probe = new THREE.Vector3();
function setMode(m) {
  mode = m;
  if (m === 'look') {
    const e = new THREE.Euler().setFromQuaternion(camera.quaternion, 'YXZ');
    Object.assign(view, { x: camera.position.x, y: camera.position.y, z: camera.position.z, yaw: e.y, pitch: e.x, fov: camera.fov });
  } else {
    walkYaw = hero.heading;
    snapCam = true;
  }
  helpEl.innerHTML = HELP[m];
}

const keys = {};
const mini = createMinimap(document.getElementById('mini'), document.getElementById('bigmap'), (x, z) => {
  if (!onLand(x, z) || !hero.alive) return false;
  if (mode === 'look') setMode('walk');
  if (cars.driving || bikes.riding) (cars.driving ? cars : bikes).use();
  return goTo(x, z);
}, drawMiniMap());
addEventListener('keydown', e => {
  keys[e.code] = true;
  if (e.code === 'Space' || e.code === 'Tab' || e.code.startsWith('Arrow')) e.preventDefault();
  if (e.repeat) return;
  if (e.code === 'Tab') mini.toggle();
  if (e.code === 'Escape') mini.toggle(false);
  if (mode === 'walk') {
    if (e.code === 'Space') queued.jump = true;
    if (e.code === 'KeyF') queued.punch = true;
    if (e.code === 'KeyG') queued.kick = true;
    if (e.code === 'KeyH') { if (cars.driving) cars.honk(); else if (bikes.riding) bikes.bell(); else queued.kick = 'round'; }
    if (e.code === 'KeyE') queued.grab = true;
  }
  const n = e.code.startsWith('Digit') ? +e.code.slice(5) : 0;
  if (n >= 1 && n <= PLACES.length && hero.alive) {
    if (mode === 'look') setMode('walk');
    if (cars.driving || bikes.riding) (cars.driving ? cars : bikes).use();
    toPlace(PLACES[n - 1]);
  }
  if (e.code === 'KeyC') nextSkin();
  if (e.code === 'KeyM') { music.start(); music.toggle(); }
  if (e.code === 'KeyV') setMode(mode === 'walk' ? 'look' : 'walk');
  if (e.code === 'KeyZ') game.setZombies(!state.zombies);
});
addEventListener('keyup', e => { keys[e.code] = false; });
let drag = null;
renderer.domElement.addEventListener('pointerdown', e => { drag = { x: e.clientX, y: e.clientY }; });
addEventListener('pointerup', () => { drag = null; });
addEventListener('pointermove', e => {
  if (!drag) return;
  const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
  drag = { x: e.clientX, y: e.clientY };
  if (mode === 'walk') { walkYaw += dx * 0.004; return; }
  const k = 0.0035 * view.fov / 68;
  view.yaw -= dx * k;
  view.pitch = Math.max(-1.3, Math.min(1.3, view.pitch - dy * k));
});
renderer.domElement.addEventListener('wheel', e => {
  e.preventDefault();
  if (mode === 'walk') walkDist = Math.max(2.5, Math.min(30, walkDist + e.deltaY * 0.01));
  else view.fov = Math.max(20, Math.min(85, view.fov + e.deltaY * 0.03));
}, { passive: false });

// one 60 Hz step, like the game's: the ragdoll's tuning is all in frames
function tick() {
  const steering = mode === 'walk' && !mini.open;
  const fwd = steering ? (keys.KeyW || keys.ArrowUp ? 1 : 0) - (keys.KeyS || keys.ArrowDown ? 1 : 0) : 0;
  const turn = steering ? (keys.ArrowRight || keys.KeyD ? 1 : 0) - (keys.ArrowLeft || keys.KeyA ? 1 : 0) : 0;
  const shift = keys.ShiftLeft || keys.ShiftRight;
  // E: into the nearest car or onto the nearest bike, whichever's closer (setting the apples down first), out of
  // or off this one, or the apples down
  if (queued.grab) {
    let ride = cars.driving ? cars : bikes.riding ? bikes : null;
    if (!ride) {
      const car = cars.nearest(), bike = bikes.nearest();
      ride = bike && (!car || bike.d < Math.hypot(car.x - hero.x, car.z - hero.z)) ? bikes : car ? cars : null;
      if (ride && hero.weapon && hero.alive) putDown();
    }
    if (!ride?.use() && hero.weapon) putDown(0.6);
  }
  queued.grab = false;
  if (bikes.riding) {
    bikes.ride(fwd, turn, shift, queued.jump);
    const d = hero.heading - walkYaw;
    walkYaw += Math.atan2(Math.sin(d), Math.cos(d)) * 0.07;
    queued.jump = queued.punch = queued.kick = false;
    updateWeapons(false, walkYaw, false);
  } else if (cars.driving) {
    cars.drive(fwd, turn, shift);
    // the camera swings round behind the car
    const d = cars.driving.heading - walkYaw;
    walkYaw += Math.atan2(Math.sin(d), Math.cos(d)) * 0.06;
    queued.jump = queued.punch = queued.kick = false;
    updateWeapons(false, walkYaw, false);
  } else {
    walkYaw += turn * 0.06;
    onFoot(Math.cos(walkYaw) * fwd, Math.sin(walkYaw) * fwd, shift);
  }
  for (const g of gangsters) g.control(...gangsterBrain(g));
  resolvePunches();
  checkHits();
  if (!cars.driving && !bikes.riding) { hero.step(); onTheBridge(); }
  bikes.update();
  for (const g of gangsters) g.step();
  if (hero.alive) state.survived += 1 / 60;
  updateGangs();
  game.update();
  updateDust();
  driveTraffic();
  if (state.shake > 0) state.shake *= 0.85;
  if (state.caughtTimer > 0) state.caughtTimer--;
  if (state.banner && --state.banner.t <= 0) state.banner = null;
}
// his part of the step on foot, as in the game's update(): running, fists and feet, the apples
function onFoot(ix, iz, shift) {
  hero.speed = RUN_SPEED * (shift ? 2.2 : 1);
  const wasDown = !hero.alive;
  // apples are thrown while F is held, where the camera looks
  const firing = !!hero.weapon && hero.alive && mode === 'walk' && (queued.punch || keys.KeyF);
  if ((queued.kick || (queued.punch && !hero.weapon)) && hero.alive) {
    // turn to face the nearest gangster in reach
    let target = null, bestD = 1.6;
    for (const g of gangsters) {
      const d = Math.hypot(g.x - hero.x, g.z - hero.z);
      if (g.alive && d < bestD && Math.abs(g.y - hero.y) < 0.9) { target = g; bestD = d; }
    }
    if (target) hero.heading = Math.atan2(target.z - hero.z, target.x - hero.x);
  }
  const throwing = firing && hero.weapon?.type === 'apples';
  hero.control(ix, iz, queued.jump, queued.punch || throwing, queued.kick);
  queued.jump = queued.punch = queued.kick = false;
  updateWeapons(firing, walkYaw, true);
  if (wasDown && hero.alive) hero.invuln = 90;
}

function followHero() {
  // behind him, or further back behind the car he's driving (looking from over its roof, so the wall check
  // doesn't catch the car itself)
  const car = cars.driving, dist = car ? walkDist + 4 : bikes.riding ? walkDist + 1.5 : walkDist;
  const hip = car ? { x: car.x, y: car.y + 1.2, z: car.z } : hero.pts.hip, cx = Math.cos(walkYaw), cz = Math.sin(walkYaw);
  eye.set(hip.x, hip.y + 0.5, hip.z);
  camTarget.set(hip.x - cx * dist, hip.y + 0.6 + dist * 0.32, hip.z - cz * dist);
  // pulled in in front of any wall or roof between him and the camera
  for (let k = 1; k <= 14; k++) {
    probe.lerpVectors(eye, camTarget, k / 14);
    if (inSolid(probe.x, probe.y, probe.z)) { camTarget.lerpVectors(eye, camTarget, Math.max(0.08, (k - 1.5) / 14)); break; }
  }
  if (snapCam) { camPos.copy(camTarget); snapCam = false; } else camPos.lerp(camTarget, 0.15);
  camera.position.copy(camPos);
  if (state.shake > 0.01) camera.position.add(probe.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(state.shake));
  camera.lookAt(hip.x + cx * 4, hip.y + 0.4, hip.z + cz * 4);
  if (camera.fov !== 62) { camera.fov = 62; camera.updateProjectionMatrix(); }
}
function flyCamera(dt) {
  const run = (keys.ShiftLeft || keys.ShiftRight ? 120 : 20) * dt;
  const fwd = (keys.KeyW || keys.ArrowUp ? 1 : 0) - (keys.KeyS || keys.ArrowDown ? 1 : 0);
  const strafe = (keys.KeyD ? 1 : 0) - (keys.KeyA ? 1 : 0);
  view.yaw += ((keys.ArrowLeft ? 1 : 0) - (keys.ArrowRight ? 1 : 0)) * 1.6 * dt;
  view.x += (-Math.sin(view.yaw) * fwd + Math.cos(view.yaw) * strafe) * run;
  view.z += (-Math.cos(view.yaw) * fwd - Math.sin(view.yaw) * strafe) * run;
  view.y = Math.max(1, view.y + ((keys.KeyE ? 1 : 0) - (keys.KeyQ ? 1 : 0)) * run);
  camera.position.set(view.x, view.y, view.z);
  camera.rotation.set(view.pitch, view.yaw, 0, 'YXZ');
  if (camera.fov !== view.fov) { camera.fov = view.fov; camera.updateProjectionMatrix(); }
}

const clock = new THREE.Clock();
let acc = 0, lastWhere = '';
function frame() {
  const dt = Math.min(clock.getDelta(), 0.05), t = clock.elapsedTime;
  for (acc += dt; acc >= 1 / 60; acc -= 1 / 60) tick();
  if (mode === 'walk') followHero(); else flyCamera(dt);
  // the sun's shadows follow whoever is looking
  const f = mode === 'walk' ? hero : camera.position, sx = Math.round(f.x), sz = Math.round(f.z), sy = mode === 'walk' ? hero.y : 0;
  keyLight.target.position.set(sx, sy, sz);
  keyLight.position.set(sx + SUN.x * 500, sy + SUN.y * 500, sz + SUN.z * 500);
  state.camX = hero.x; state.camZ = hero.z;   // the sound effects play near here
  renderTraffic(t);
  bikes.render();
  renderWalkers(dt, t);
  hero.updateMeshes();
  if (cars.driving) hero.group.visible = false;   // he's inside
  for (const g of gangsters) g.updateMeshes();
  renderWeapons(t);
  renderGangs(t);
  renderBottles();
  game.render(t);
  const where = leaving ? whereEl.textContent : whereIs(hero.x, hero.z, hero.y);
  if (where !== lastWhere) { whereEl.textContent = where; lastWhere = where; }
  const car = cars.driving, bike = bikes.riding;
  const mph = v => Math.round(Math.abs(v) * 60 * 2.237);
  const prompt = car ? `${mph(car.speed)} mph · E to get out` : bike ? `${mph(bike.speed)} mph · E to get off`
    : !hero.alive ? '' : bikes.nearest() ? 'E: ride the fixie' : cars.nearest() ? 'E: get in the car' : '';
  if (promptEl.textContent !== prompt) promptEl.textContent = prompt;
  const target = game.target;
  mini.draw(hero, target, gangsters);
  updateHud(target ? Math.hypot(target.x - hero.x, target.z - hero.z) : null);
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
showSkin();
setMode('walk');
frame();

window.manhattan = {
  hero, keys, queued, tick, goTo, toBridge, setMode, camera, scene, renderer, PLACES, mini, game, gangsters, state, cars, bikes,
  fleet, walkers, view, BR,
  get yaw() { return walkYaw; }, set yaw(v) { walkYaw = v; },
};
