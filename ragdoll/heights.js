// Brooklyn Heights, the stretch circled on the map from the Brooklyn Bridge down to Atlantic Ave, with the
// game played on it: the game's hero, gangsters and weapons in the neighbourhood built in heightsworld.js,
// a run from turf to turf (heightsrun.js), traffic, people out walking, an over-the-shoulder or free
// camera, places to jump to, and a minimap.
import * as THREE from 'three';
import { camera, hemi, keyLight, renderer, scene, stars, sunsetRim } from './scene.js';
import { RUN_SPEED } from './config.js';
import { mat, addBox } from './materials.js';
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
import { BQE, BRIDGE, CELLS, CURB, EW, NS, PIERS, PROMENADE, TOP, WALK, WF, bridgeY, descentAt, descentY } from './heightsmap.js';
import { HEIGHTS, buildHeights, floorAt, inSolid, movers, onLand, parked, props } from './heightsworld.js';
import { createMinimap } from './heightsmini.js';
import { createRun, updateHud } from './heightsrun.js';
import { createCars } from './heightscars.js';
import { createBikes } from './heightsbike.js';
import { horde } from './zombies.js';

// the fight happens here now, not on the game's street
Object.assign(arena, HEIGHTS);
// the ragdoll brings the game's street with it: its traffic doesn't belong here, its music stays off until M
for (const c of gameTraffic) scene.remove(c.g);
music.toggle();
state.bestBlocks = +localStorage.getItem('ragdollBestTurfs') || 0;
horde.bestKey = 'ragdollBestHeightsWave';
state.bestWave = +localStorage.getItem(horde.bestKey) || 0;

// ---------- A sunny late afternoon in October: the sun low over the harbour, west-southwest ----------
{
  const c = document.createElement('canvas'); c.width = 2; c.height = 512;
  const g = c.getContext('2d');
  const gr = g.createLinearGradient(0, 0, 0, 512);
  gr.addColorStop(0, '#3f78c2'); gr.addColorStop(0.5, '#8db5de'); gr.addColorStop(0.85, '#e7dccb'); gr.addColorStop(1, '#f4d7b0');
  g.fillStyle = gr; g.fillRect(0, 0, 2, 512);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  scene.background = t;
}
scene.fog = new THREE.Fog(0xd3dbe2, 450, 5200);
hemi.color.set(0xe2ecff); hemi.groundColor.set(0x6d6250); hemi.intensity = 1.55;
keyLight.color.set(0xffddb0); keyLight.intensity = 2.5;
keyLight.shadow.normalBias = 0.04;
Object.assign(keyLight.shadow.camera, { left: -48, right: 48, top: 48, bottom: -48, near: 1, far: 500 });
keyLight.shadow.camera.updateProjectionMatrix();
const SUN = new THREE.Vector3(-0.68, 0.44, 0.58).normalize();
sunsetRim.color.set(0xb8c8e8); sunsetRim.intensity = 0.35; sunsetRim.position.set(400, 300, -300);
stars.visible = false;
camera.far = 7000; camera.updateProjectionMatrix();

const world = new THREE.Group();
scene.add(world);
buildHeights(world);

// ---------- The game's hero, in whichever skin was last picked ----------
const hero = man;
const queued = { jump: false, punch: false, kick: false, grab: false };
function place(r, x, z, y, heading) {
  const sx = x - r.x, sz = z - r.z, sy = y - r.y;
  Object.assign(r, { x, z, y, vx: 0, vz: 0, vy: 0, onGround: true, jumpsLeft: 2 });
  if (heading !== undefined) r.heading = heading;
  for (const q of Object.values(r.pts)) { q.x += sx; q.px += sx; q.z += sz; q.pz += sz; q.y += sy; q.py += sy; }
}
// a clear spot near (x, z) at street level (or up on the bridge's walkway): not inside a house, not in the river
const onBridge = (x, z) => Math.abs(z - BRIDGE.z) <= 13 && x <= BRIDGE.xStart && x >= BRIDGE.xTower2 + 9;
function spotNear(x, z) {
  const high = onBridge(x, z);
  for (let r = 0; r < 40; r += 1.5) {
    for (let a = 0; a < (r ? 16 : 1); a++) {
      const px = x + Math.cos(a / 16 * Math.PI * 2) * r, pz = z + Math.sin(a / 16 * Math.PI * 2) * r;
      if (high ? !onBridge(px, pz) : !onLand(px, pz)) continue;
      const y = floorAt(px, pz, high ? bridgeY(px) + 1 : TOP + 1);
      if (high && y < bridgeY(px) - 1.5) continue;
      if (!inSolid(px, y + 1, pz) && !inSolid(px, y + 1.7, pz)) return [px, y, pz];
    }
  }
  return null;
}
// places to jump to with the number keys
const PLACES = [
  { name: 'The Promenade', x: -8, z: -5, heading: Math.PI },
  { name: 'Brooklyn Bridge', x: -150, z: -800, heading: Math.PI },
  { name: 'Borough Hall', x: 645, z: 165, heading: Math.PI / 2 },
  { name: 'Pier 1', x: -150, z: -650, heading: Math.PI },
  { name: 'Cadman Plaza Park', x: 660, z: -420, heading: -Math.PI / 2 },
  { name: 'Montague St', x: 300, z: -3.5, heading: Math.PI },
  { name: 'Atlantic Ave & Hicks', x: 248, z: 503, heading: 0 },
];
let walkYaw = Math.PI, snapCam = true;
function goTo(x, z, heading) {
  const s = spotNear(x, z);
  if (!s) return false;
  place(hero, s[0], s[2], s[1], heading ?? hero.heading);
  walkYaw = hero.heading; snapCam = true;
  return true;
}
// back from Lower Manhattan over the bridge (manhattan.html sends him here), or the Promenade
const fromManhattan = new URLSearchParams(location.search).get('from') === 'manhattan';
if (fromManhattan) goTo(BRIDGE.xTower2 + 40, BRIDGE.z, 0);
else goTo(PLACES[0].x, PLACES[0].z, PLACES[0].heading);
// walking up to the Manhattan tower takes him across to Lower Manhattan
let leaving = false;
function toManhattan() {
  if (leaving || hero.y < TOP + 10 || Math.abs(hero.z - BRIDGE.z) > 14 || hero.x > BRIDGE.xTower2 + 14) return;
  leaving = true;
  whereEl.textContent = 'Over the river to Manhattan…';
  location.href = 'manhattan.html?from=brooklyn';
}

const whoEl = document.getElementById('who'), whereEl = document.getElementById('where'), helpEl = document.getElementById('help');
const promptEl = document.getElementById('prompt');
function showSkin() { whoEl.textContent = `Walking as: ${SKINS[hero.skin].name} (C to change)`; }
function nextSkin() {
  hero.setSkin(SKIN_ORDER[(SKIN_ORDER.indexOf(hero.skin) + 1) % SKIN_ORDER.length]);
  localStorage.setItem('ragdollSkin', hero.skin);
  showSkin();
}
// the street corner (or park, pier, bridge) he's at
function whereIs(x, z, y) {
  if (Math.abs(z - BRIDGE.z) < 14 && x < BRIDGE.xStart && y > TOP + 1.5) return 'Brooklyn Bridge';
  if (x >= PROMENADE.x0 && x <= PROMENADE.x1 && z >= PROMENADE.z0 && z <= PROMENADE.z1) return 'Brooklyn Heights Promenade';
  const d = descentAt(x, z);
  if (d) return d.name;
  if (x < PROMENADE.x0) {
    if (x > -30) return 'Furman St';
    const pier = PIERS.find(p => x >= p.x0 && x <= p.x1 && z >= p.z0 && z <= p.z1);
    return pier ? pier.name : z < -770 ? 'Fulton Ferry Landing' : 'Brooklyn Bridge Park';
  }
  const ns = NS.find(s => Math.abs(x - s.x) <= s.r + WALK && z >= s.z0 - 6 && z <= s.z1 + 6);
  const ew = EW.find(s => Math.abs(z - s.z) <= s.r + WALK && x >= s.x0 - 6 && x <= s.x1 + 6);
  if (ns && ew) return `${ns.name} & ${ew.name}`;
  if (ns || ew) return (ns || ew).name;
  const c = CELLS.find(k => x >= k.x0 && x <= k.x1 && z >= k.z0 && z <= k.z1);
  return c ? { cadman: 'Cadman Plaza Park', borough: 'Columbus Park, by Borough Hall', courts: 'by the courthouses', squibb: 'Squibb Park' }[c.kind] || 'Brooklyn Heights' : 'Brooklyn Heights';
}
// out in the open (a street, a sidewalk, a park, the Promenade or the waterfront), not in someone's back yard
const OPEN = ['cadman', 'courts', 'borough', 'squibb', 'bridge'];
function outdoors(x, z) {
  if (x < 0) return true;
  if (NS.some(s => Math.abs(x - s.x) <= s.r + WALK && z >= s.z0 - WALK && z <= s.z1 + WALK)) return true;
  if (EW.some(s => Math.abs(z - s.z) <= s.r + WALK && x >= s.x0 - WALK && x <= s.x1 + WALK)) return true;
  const c = CELLS.find(k => x >= k.x0 && x <= k.x1 && z >= k.z0 && z <= k.z1);
  return !!c && OPEN.includes(c.kind);
}

// ---------- The run: turf to turf, the game's gangsters and weapons ----------
const game = createRun({ spotNear, place, outdoors, home: { ...PLACES[0], name: 'the Promenade' } });
arena.spawnAt = game.spawnAt;
arena.pickupAt = game.pickupAt;
arena.weapons = ['apples'];
// zombie night's apples: a clear spot near there at about his level, or at his feet
arena.dropNear = (x, z) => {
  const s = spotNear(x, z);
  return s && Math.abs(s[1] - hero.y) < 2.5 ? { x: s[0], y: s[1], z: s[2] } : { x: hero.x, y: hero.y, z: hero.z };
};
game.start(1);
// heights.html?zombies starts on zombie night
if (new URLSearchParams(location.search).has('zombies')) game.setZombies(true);

// ---------- Traffic ----------
// lanes: along x or z at a fixed coordinate, one way; y is the road's height (a function of the distance
// along it on the hills and the bridge); `walk` lanes are ones the hero can step out into
const lane = (axis, at, from, to, dir, n, speed, y = TOP, walk = true) => ({ axis, at, from, to, dir, n, speed, y, walk });
const hill = s => s < 70 ? descentY({ xTop: 70, xBottom: -19 }, s) : TOP;
const LANES = [
  lane('z', 350, -752, 578, 1, 6, 0.16),                 // Henry St, southbound
  lane('z', 250, -752, 578, -1, 6, 0.15),                // Hicks St, northbound
  lane('z', 470, -104, 578, -1, 4, 0.15),                // Clinton St
  lane('z', 557.5, -752, 578, -1, 7, 0.2), lane('z', 562.5, -752, 578, 1, 7, 0.2),    // Court St, Cadman Plaza W
  lane('z', 756, -752, 578, -1, 7, 0.2), lane('z', 764, -752, 578, 1, 7, 0.2),        // Adams St, Cadman Plaza E
  lane('x', 506.5, -19, 818, -1, 6, 0.2, hill), lane('x', 513.5, -19, 818, 1, 6, 0.2, hill),   // Atlantic Ave
  lane('x', 260, -19, 818, 1, 5, 0.16, hill),            // Joralemon St, up the hill from Furman St
  lane('x', -263, 568, 818, -1, 2, 0.2), lane('x', -257, 568, 818, 1, 2, 0.2),        // Tillary St
  lane('z', -26.5, -828, 518, -1, 5, 0.18, WF), lane('z', -21.5, -828, 518, 1, 5, 0.18, WF),   // Furman St
  lane('z', -11, BQE.z0, BQE.z1, -1, 6, 0.36, BQE.decks[0], false), lane('z', -5, BQE.z0, BQE.z1, -1, 5, 0.32, BQE.decks[0], false),
  lane('z', -11, BQE.z0, BQE.z1, 1, 6, 0.36, BQE.decks[1], false), lane('z', -5, BQE.z0, BQE.z1, 1, 5, 0.32, BQE.decks[1], false),
  lane('x', BRIDGE.z - 8.5, -1100, BRIDGE.xStart, -1, 8, 0.28, s => bridgeY(s) - 2.98, false),
  lane('x', BRIDGE.z + 8.5, -1100, BRIDGE.xStart, 1, 8, 0.28, s => bridgeY(s) - 2.98, false),
];
const CAR_COLORS = ['#f2c230', '#e9e7e2', '#1d1f23', '#8c9196', '#5d6b80', '#7b1f1f', '#2c3e5c', '#f2c230', '#b8b4aa', '#2a2c31'];
const traffic = [];
for (const L of LANES) {
  for (let k = 0; k < L.n; k++) {
    const s = L.from + (k + Math.random() * 0.6) * (L.to - L.from) / L.n;
    const c = { L, s, v: L.speed, cruise: L.speed * (0.85 + Math.random() * 0.3), color: CAR_COLORS[Math.floor(Math.random() * CAR_COLORS.length)] };
    if (L.walk) { c.box = { x0: 0, x1: 0, z0: 0, z1: 0, top: 0 }; movers.push(c.box); }
    traffic.push(c);
  }
}
const carMesh = new THREE.InstancedMesh(props.carGeo, props.carMat, traffic.length);
carMesh.castShadow = carMesh.receiveShadow = true;
carMesh.frustumCulled = false;
traffic.forEach((c, i) => carMesh.setColorAt(i, new THREE.Color(c.color)));
world.add(carMesh);
const carObj = new THREE.Object3D();
const yOf = (L, s) => typeof L.y === 'function' ? L.y(s) : L.y;
const cars = createCars({
  traffic, place, movers, parked, props,
  pose: c => {
    const L = c.L;
    return {
      x: L.axis === 'x' ? c.s : L.at, y: yOf(L, c.s), z: L.axis === 'x' ? L.at : c.s, speed: c.v,
      heading: L.axis === 'x' ? (L.dir > 0 ? 0 : Math.PI) : (L.dir > 0 ? Math.PI / 2 : -Math.PI / 2),
    };
  },
});
// fixed gear bikes locked up round the neighbourhood: [x, z, heading], on a sidewalk or path near each
const BIKE_RACKS = [
  [-11, -8, Math.PI / 2], [-5.5, 30, -Math.PI / 2],   // the Promenade
  [300, -7.5, Math.PI], [200, 115.6, 0],              // Montague St, Remsen St
  [640, 160, 0], [655, -415, -Math.PI / 2],           // Columbus Park, Cadman Plaza Park
  [-146, -645, Math.PI], [262, 497, 0],               // Pier 1, Atlantic Ave & Hicks
];
const bikes = createBikes({
  parent: world, place,
  racks: BIKE_RACKS.map(([x, z, h]) => { const s = spotNear(x, z); return s && [s[0], s[1], s[2], h]; }).filter(Boolean),
});
function driveTraffic() {
  for (const c of traffic) {
    if (c.taken) continue;   // he's driving it now (heightscars.js)
    const L = c.L;
    let gap = Infinity;
    for (const o of traffic) {
      if (o === c || o.L !== L || o.taken) continue;
      const d = (o.s - c.s) * L.dir - 4.6;
      if (d > -1 && d < gap) gap = d;
    }
    // anyone (him or a gangster) standing in the lane ahead, or a car he's driven
    if (L.walk) {
      for (const p of [hero, ...gangsters, ...cars.mine, ...bikes.bikes]) {
        const along = L.axis === 'x' ? p.x : p.z, across = L.axis === 'x' ? p.z : p.x;
        const d = (along - c.s) * L.dir - 2.6;
        if (Math.abs(across - L.at) < 1.7 && Math.abs(p.y - yOf(L, c.s)) < 2 && d > -1.5) gap = Math.min(gap, d);
      }
    }
    const want = gap < 2.5 ? 0 : gap < 14 ? c.cruise * (gap - 2.5) / 11.5 : c.cruise;
    c.v += (want - c.v) * 0.08;
    c.s += c.v * L.dir;
    if (c.s > L.to) c.s = L.from; else if (c.s < L.from) c.s = L.to;
    if (c.box) {
      const y = yOf(L, c.s), b = c.box;
      if (L.axis === 'x') Object.assign(b, { x0: c.s - 2.2, x1: c.s + 2.2, z0: L.at - 0.9, z1: L.at + 0.9, top: y + 1.5 });
      else Object.assign(b, { x0: L.at - 0.9, x1: L.at + 0.9, z0: c.s - 2.2, z1: c.s + 2.2, top: y + 1.5 });
    }
  }
}
function renderTraffic() {
  traffic.forEach((c, i) => {
    if (c.taken) { carMesh.setMatrixAt(i, carObj.matrix.makeScale(0, 0, 0)); return; }
    const L = c.L, y = yOf(L, c.s);
    if (L.axis === 'x') { carObj.position.set(c.s, y, L.at); carObj.rotation.set(0, L.dir > 0 ? 0 : Math.PI, 0); }
    else { carObj.position.set(L.at, y, c.s); carObj.rotation.set(0, L.dir > 0 ? -Math.PI / 2 : Math.PI / 2, 0); }
    carObj.updateMatrix();
    carMesh.setMatrixAt(i, carObj.matrix);
  });
  carMesh.instanceMatrix.needsUpdate = true;
}

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
const TOPS = ['#7a5434', '#e8e6e1', '#2f3a4f', '#9a2e2e', '#d6c39a', '#3d4d3a', '#c46a2c', '#5a5f7a', '#1e1e22', '#8fb0c9'];
const LEGS = ['#2a2c30', '#262a33', '#3a3a3a', '#41444a', '#55606e', '#6b5a48'];
const SKIN_TONES = ['#c99a7a', '#d9ad8c', '#8a5f45', '#6e4a36', '#e0b896', '#a87454'];
const HAIR = ['#2a201a', '#4a3320', '#8a6a3a', '#111', '#9a9590'];
const pick = a => a[Math.floor(Math.random() * a.length)];
// paths: along x or z at a fixed coordinate, between a0 and a1, at height y(along)
const paths = [];
for (const c of CELLS) {
  if (Math.random() > 0.3) continue;
  for (const [side, st] of Object.entries(c.front)) {
    if (Math.random() > 0.5) continue;
    const off = 1.75;
    if (side === 'n' || side === 's') paths.push({ axis: 'x', at: side === 'n' ? c.sz0 + off : c.sz1 - off, a0: c.sx0 + 3, a1: c.sx1 - 3, y: () => TOP + CURB });
    else paths.push({ axis: 'z', at: side === 'w' ? c.sx0 + off : c.sx1 - off, a0: c.sz0 + 3, a1: c.sz1 - 3, y: () => TOP + CURB });
  }
}
for (let k = 0; k < 8; k++) paths.push({ axis: 'z', at: -12 + Math.random() * 7, a0: PROMENADE.z0 + 2, a1: PROMENADE.z1 - 2, y: () => TOP });
for (let k = 0; k < 6; k++) paths.push({ axis: 'z', at: -108 + Math.random() * 2, a0: -760, a1: 510, y: () => WF + CURB });
for (let k = 0; k < 6; k++) paths.push({ axis: 'x', at: BRIDGE.z - 1.5 + Math.random() * 3, a0: -170, a1: 790, y: s => Math.min(bridgeY(s), BRIDGE.deck) });
const walkers = paths.map(path => {
  const w = { ...buildPerson(pick(TOPS), pick(LEGS), pick(SKIN_TONES), pick(HAIR)), path, dir: Math.random() < 0.5 ? 1 : -1, speed: 1 + Math.random() * 0.5 };
  w.a = path.a0 + Math.random() * (path.a1 - path.a0);
  return w;
});
function renderWalkers(dt, t) {
  for (const w of walkers) {
    const { path } = w;
    const x = path.axis === 'x' ? w.a : path.at, z = path.axis === 'x' ? path.at : w.a;
    const far = Math.hypot(x - hero.x, z - hero.z) > 160;
    w.p.visible = !far;
    w.a += w.dir * w.speed * dt;
    if (w.a > path.a1) { w.a = path.a1; w.dir = -1; } else if (w.a < path.a0) { w.a = path.a0; w.dir = 1; }
    if (far) continue;
    const s = t * w.speed * 3.2 + w.phase;
    w.p.position.set(x, path.y(w.a) + Math.abs(Math.sin(s)) * 0.03, z);
    w.p.rotation.y = path.axis === 'x' ? (w.dir > 0 ? 0 : Math.PI) : (w.dir > 0 ? -Math.PI / 2 : Math.PI / 2);
    for (const { leg, arm, side } of w.limbs) {
      leg.rotation.z = Math.sin(s) * 0.45 * side;
      arm.rotation.z = -Math.sin(s) * 0.35 * side;
    }
  }
}

// ---------- Cameras: over the hero's shoulder ('walk'), or free ('look') ----------
const view = { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, fov: 60 };
const HELP = {
  walk: '↑ ↓ / W S run · ← → / A D or drag to turn · Shift sprint · wheel zoom · Space jump (again for a flip)<br>F punch (or throw apples, hold it) · G kick · H round kick · E get in / out of a car, on / off a bike (or put the apples down) · Tab map (click to go there) · 1–7 places · C skin · M music · V free camera · Z zombie night<br>Walk the Brooklyn Bridge out to its Manhattan tower to cross to Lower Manhattan',
  look: 'Drag to look · wheel to zoom · W A S D / arrows to fly · Shift faster · Q E down / up<br>Tab map · 1–7 places · V back to walking',
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
  if ((!onLand(x, z) && !onBridge(x, z)) || !hero.alive) return false;
  if (mode === 'look') setMode('walk');
  if (cars.driving || bikes.riding) (cars.driving ? cars : bikes).use();
  return goTo(x, z);
});
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
    const p = PLACES[n - 1];
    if (mode === 'look') setMode('walk');
    if (cars.driving || bikes.riding) (cars.driving ? cars : bikes).use();
    goTo(p.x, p.z, p.heading);
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
  if (!cars.driving && !bikes.riding) hero.step();
  toManhattan();
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
  // he runs at the game's pace; the neighbourhood is a kilometre across, so Shift sprints
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
  // with apples, holding F keeps throwing (each throw is a punch)
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
  const run = (keys.ShiftLeft || keys.ShiftRight ? 60 : 12) * dt;
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
  const fx = mode === 'walk' ? hero.x : camera.position.x, fz = mode === 'walk' ? hero.z : camera.position.z;
  const sx = Math.round(fx), sz = Math.round(fz), sy = mode === 'walk' ? hero.y : TOP;
  keyLight.target.position.set(sx, sy, sz);
  keyLight.position.set(sx + SUN.x * 250, sy + SUN.y * 250, sz + SUN.z * 250);
  state.camX = hero.x; state.camZ = hero.z;   // the sound effects play near here
  renderTraffic();
  bikes.render();
  renderWalkers(dt, t);
  hero.updateMeshes();
  if (cars.driving) hero.group.visible = false;   // he's inside
  for (const g of gangsters) g.updateMeshes();
  renderWeapons(t);
  renderGangs(t);
  renderBottles();
  game.render(t);
  const where = whereIs(hero.x, hero.z, hero.y);
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

window.heights = {
  hero, keys, queued, tick, goTo, setMode, camera, scene, renderer, traffic, walkers, PLACES, mini, game, gangsters, state, cars, bikes,
  get yaw() { return walkYaw; }, set yaw(v) { walkYaw = v; },   // where he's looking (and aiming)
};
