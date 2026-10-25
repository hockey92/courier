// The endless street: chunk data (obstacles, collision boxes, house rows), building chunks,
// the distant skyline, and keeping chunks loaded around the view.
import * as THREE from 'three';
import { BLOCK, BODY_R, CHUNK, FAR_CHUNK, Z_MAX, Z_MIN, seeded, streetNumber } from './config.js';
import { showFrontRow } from './state.js';
import { scene } from './scene.js';
import { addBox, addBuilding, crateMat, cylGeo, glowMat, mat } from './materials.js';
import { FACADE_Z, FRONT_ROW_SHIFT, addBrownstone, fence } from './brownstones.js';
import { buildHomeless } from './homeless.js';
import { CAR_W, LANES, carBoxesNear } from './traffic.js';

// half the depth (z) of each obstacle, and whether it may stand on the strip between the two lanes
const HALF_D = { crate: 0.35, pyramid: 0.35, trash: 0.25, hydrant: 0.16, dumpster: 0.55, barrier: 0.225 };
const IN_ROAD = { crate: true, pyramid: true, trash: true, barrier: true };
// the z bands the traffic drives through, with a little room either side
const LANE_BANDS = LANES.map(l => [l.z - CAR_W / 2 - 0.15, l.z + CAR_W / 2 + 0.15]);
// move an obstacle at z out of the traffic lanes, to the nearest sidewalk edge or the middle strip
function clearOfLanes(type, z) {
  const h = HALF_D[type];
  if (!LANE_BANDS.some(([a, b]) => z + h > a && z - h < b)) return z;
  const spots = [-2.3 - h, 3.5 + h];
  const [back, front] = [LANE_BANDS[1][1], LANE_BANDS[0][0]];
  if (IN_ROAD[type] && front - back >= 2 * h) spots.push((back + front) / 2);
  return spots.reduce((best, s) => Math.abs(s - z) < Math.abs(best - z) ? s : best);
}

// ---------- World generation ----------
// Street chunks: ground, a streetlamp, buildings behind the back sidewalk and obstacles.
export function obstacleBoxes(o) {
  const b = (cx, cz, w, d, top) => ({ x0: cx - w / 2, x1: cx + w / 2, z0: cz - d / 2, z1: cz + d / 2, top });
  const { x, z } = o;
  switch (o.type) {
    case 'crate': return [b(x, z, 0.7, 0.7, 0.7)];
    case 'pyramid': return [b(x, z, 1.4, 0.7, 0.7), b(x, z, 0.7, 0.7, 1.4)];
    case 'trash': return [b(x, z, 0.5, 0.5, 0.83)];
    case 'hydrant': return [b(x, z, 0.32, 0.32, 0.62)];
    case 'dumpster': return [b(x, z, 1.8, 1.1, 1.08)];
    case 'barrier': return [b(x, z, 1.6, 0.45, 0.8)];
  }
}

export const chunkData = new Map();
export function getChunkData(i) {
  if (chunkData.has(i)) return chunkData.get(i);
  const rnd = seeded(i * 7919 + 13);
  const start = i * CHUNK;
  const lampX = start + 6;
  const obstacles = [];
  const boxes = [{ x0: lampX - 0.08, x1: lampX + 0.08, z0: -4.68, z1: -4.52, top: 4.2 }];
  // now and then a guy chilling on the back sidewalk (always one just ahead of the start)
  const hrnd = seeded(i * 3571 + 99);
  let homeless = null;
  if (i === 0 || hrnd() < 0.35) {
    let hx = i === 0 ? 3 : start + 2 + hrnd() * (CHUNK - 4);
    if (Math.abs(hx - lampX) < 2) hx = lampX + (hx < lampX ? -2.2 : 2.2);
    homeless = { x: hx, z: -4.7 };
    boxes.push(
      { x0: hx - 1, x1: hx + 1.3, z0: -5.1, z1: -4.3, top: 0.5 },
      { x0: hx + 1.09, x1: hx + 1.51, z0: -5.03, z1: -4.67, top: 0.36 },
    );
  }
  for (let x = start + 1.5 + rnd() * 2; x < start + CHUNK - 1.5; x += 3.5 + rnd() * 4) {
    if (Math.abs(x) < 5) continue; // keep the starting spot clear
    const roll = rnd();
    // (the cars that used to be parked here now drive: traffic.js)
    const type = roll < 0.2 ? 'crate' : roll < 0.3 ? 'pyramid' : roll < 0.45 ? 'trash' : roll < 0.55 ? 'hydrant'
      : roll < 0.68 ? 'dumpster' : roll < 0.85 ? null : 'barrier';
    let z = Z_MIN + 0.6 + rnd() * (Z_MAX - Z_MIN - 1.2);
    if (!type) continue;
    if (Math.abs(x - lampX) < 1.6 && z < -3.4) z += 2.2;
    if (homeless && Math.abs(x - homeless.x) < 2.6 && z < -3.2) z += 2.2;
    z = clearOfLanes(type, z);
    const o = { type, x, z, taken: false };
    o.boxes = obstacleBoxes(o);
    obstacles.push(o);
    boxes.push(...o.boxes);
  }
  // a manhole on the strip between the lanes; now and then the crew has left one open (always one just by the start)
  const mrnd = seeded(i * 6151 + 31);
  const mx = i === 0 ? 3.5 : start + 2 + mrnd() * (CHUNK - 4), mz = 0.6;
  const covered = boxes.some(b => mx > b.x0 - 0.9 && mx < b.x1 + 0.9 && mz > b.z0 - 0.9 && mz < b.z1 + 0.9);
  const manhole = { x: mx, z: mz, open: (i === 0 || mrnd() < 0.4) && !covered };
  if (manhole.open) boxes.push({ x0: mx - 0.95, x1: mx - 0.55, z0: mz - 0.5, z1: mz - 0.1, top: 0.5 }); // traffic cone
  // the first chunk of every block after the first starts with a crossing: crosswalk, signal and street sign
  const crossing = i > 0 && i % (BLOCK / CHUNK) === 0 ? i / (BLOCK / CHUNK) : 0;
  if (crossing) boxes.push({ x0: start + 0.09, x1: start + 0.21, z0: -2.61, z1: -2.49, top: 3.2 }); // signal pole
  const buildings = makeRow(rnd, start);
  const frontRow = makeRow(seeded(i * 4441 + 7), start);
  const data = { lampX, obstacles, boxes, buildings, frontRow, homeless, manhole, crossing };
  chunkData.set(i, data);
  return data;
}

// a row of brownstones, now and then a taller apartment block with a water tower
export function makeRow(rnd, start) {
  const buildings = [];
  for (let bx = start; bx < start + CHUNK - 0.01; ) {
    const left = start + CHUNK - bx;
    const brownstone = left >= 5.4 && rnd() < 0.75;
    let w = brownstone ? 5.4 + rnd() * 1.2 : 4 + rnd() * 6;
    if (w > left || left - w < 2.5) w = left; // no slivers at the end of the block
    if (brownstone) {
      buildings.push({ type: 'brownstone', x: bx + w / 2, w, h: 7.5 + rnd() * 0.3, d: 9 + rnd() * 3,
        stone: Math.floor(rnd() * 3), doorLeft: rnd() < 0.5, lit: Math.floor(rnd() * 3) });
    } else {
      buildings.push({ type: 'apartment', x: bx + w / 2, w, h: 8 + rnd() * 5, d: 8 + rnd() * 6,
        variant: Math.floor(rnd() * 3), tower: rnd() < 0.5, tx: rnd() });
    }
    bx += w;
  }
  return buildings;
}

// the open manhole a rat at (x, z) would drop down, if any
export function openManholeAt(x, z) {
  const m = getChunkData(Math.floor(x / CHUNK)).manhole;
  return m.open && Math.hypot(x - m.x, z - m.z) < 0.27 ? m : null;
}

export function boxesNear(x, range) {
  const out = [];
  for (let i = Math.floor((x - range) / CHUNK); i <= Math.floor((x + range) / CHUNK); i++) out.push(...getChunkData(i).boxes);
  out.push(...carBoxesNear(x, range));
  return out;
}

export function buildObstacle(g, o) {
  const { x, z } = o;
  switch (o.type) {
    case 'crate': addBox(g, 0.7, 0.7, 0.7, crateMat, x, 0.35, z); break;
    case 'pyramid':
      addBox(g, 0.7, 0.7, 0.7, crateMat, x - 0.35, 0.35, z);
      addBox(g, 0.7, 0.7, 0.7, crateMat, x + 0.35, 0.35, z);
      addBox(g, 0.7, 0.7, 0.7, crateMat, x, 1.05, z);
      break;
    case 'trash':
      addBox(g, 0.5, 0.75, 0.5, mat('#8a919b'), x, 0.375, z);
      addBox(g, 0.58, 0.08, 0.58, mat('#6d737c'), x, 0.79, z);
      addBox(g, 0.16, 0.05, 0.06, mat('#6d737c'), x, 0.855, z);
      break;
    case 'hydrant':
      addBox(g, 0.26, 0.5, 0.26, mat('#c8302c'), x, 0.25, z);
      addBox(g, 0.42, 0.1, 0.12, mat('#c8302c'), x, 0.33, z);
      addBox(g, 0.18, 0.12, 0.18, mat('#8f1f1c'), x, 0.56, z);
      break;
    case 'dumpster':
      addBox(g, 1.8, 0.95, 1.1, mat('#2e6b45'), x, 0.55, z);
      addBox(g, 1.9, 0.08, 1.2, mat('#245437'), x, 1.04, z);
      for (const dx of [-0.7, 0.7]) addBox(g, 0.2, 0.1, 0.9, mat('#111'), x + dx, 0.05, z);
      break;
    case 'barrier':
      addBox(g, 1.6, 0.8, 0.45, mat('#b9b6ae'), x, 0.4, z);
      for (const y of [0.55, 0.68]) addBox(g, 1.62, 0.07, 0.47, mat('#e86a1f'), x, y, z);
      break;
  }
}

export function addCyl(g, rTop, rBottom, h, material, x, y, z, cast = true) {
  const m = new THREE.Mesh(cylGeo(rTop, rBottom, h), material);
  m.position.set(x, y, z);
  m.castShadow = cast; m.receiveShadow = true;
  g.add(m);
  return m;
}

export function buildManhole(g, { x, z, open }) {
  const iron = mat('#34323a'), ridge = mat('#4a4852');
  if (!open) {
    addCyl(g, 0.36, 0.36, 0.03, iron, x, 0.015, z, false);
    for (const dz of [-0.16, 0, 0.16]) addBox(g, 0.52 - Math.abs(dz) * 1.4, 0.012, 0.04, ridge, x, 0.032, z + dz, false);
    return;
  }
  addCyl(g, 0.38, 0.38, 0.02, ridge, x, 0.01, z, false);                                       // rim
  addCyl(g, 0.31, 0.31, 0.025, mat('#040605', { emissive: 0x06140a }), x, 0.013, z, false);    // the hole
  const cover = addCyl(g, 0.36, 0.36, 0.03, iron, x + 0.82, 0.04, z + 0.22, false);            // slid aside
  cover.rotation.z = 0.08;
  const orange = mat('#ee6a1c'), white = mat('#f4f1ea');
  const cx = x - 0.75, cz = z - 0.3;
  addBox(g, 0.4, 0.04, 0.4, orange, cx, 0.02, cz);                                              // traffic cone
  addCyl(g, 0.025, 0.15, 0.46, orange, cx, 0.27, cz);
  addCyl(g, 0.075, 0.1, 0.08, white, cx, 0.3, cz);
}

// every traffic signal shares these, so they all change together: red while the block's crew is still
// about, green once you've cleared it (blocks.js)
export const signalMats = {
  red: new THREE.MeshStandardMaterial({ color: 0x3a1010, emissive: 0xff2a1a, emissiveIntensity: 2, flatShading: true }),
  green: new THREE.MeshStandardMaterial({ color: 0x103a1c, emissive: 0x2aff7a, emissiveIntensity: 0, flatShading: true }),
};

// crossing n sits at x = n * BLOCK, at the start of the chunk
export function buildCrossing(g, disposables, x, n) {
  const white = mat('#e9e6dc');
  for (let z = -1.85; z < 3.2; z += 0.75) addBox(g, 2.1, 0.02, 0.42, white, x + 1.65, 0.007, z, false); // crosswalk
  addBox(g, 0.22, 0.02, 5.4, white, x + 0.35, 0.007, 0.6, false);                                      // stop line
  const px = x + 0.15, pz = -2.55, pole = mat('#2c3a30');
  addBox(g, 0.12, 3.2, 0.12, pole, px, 1.6, pz);
  // signal head on top, lit towards the behind-view camera (-x) and the side-view camera (+z)
  addBox(g, 0.3, 0.84, 0.3, mat('#d6a51c'), px, 3.62, pz);
  const amber = mat('#3a2a08');
  for (const [m, y] of [[signalMats.red, 3.88], [amber, 3.62], [signalMats.green, 3.36]]) {
    addBox(g, 0.02, 0.19, 0.19, m, px - 0.16, y, pz, false);
    addBox(g, 0.19, 0.19, 0.02, m, px, y, pz + 0.16, false);
  }
  // green street-name blades, one facing each camera
  const c = document.createElement('canvas'); c.width = 256; c.height = 64;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#1d6b3c'; ctx.fillRect(0, 0, 256, 64);
  ctx.strokeStyle = '#f4f4f4'; ctx.lineWidth = 4; ctx.strokeRect(5, 5, 246, 54);
  ctx.fillStyle = '#f4f4f4'; ctx.font = 'bold 36px system-ui, sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(`W ${streetNumber(n)} ST`, 128, 34);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sign = new THREE.MeshStandardMaterial({ map: tex, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.3, flatShading: true });
  disposables.push(tex, sign);
  addBox(g, 1.1, 0.26, 0.03, sign, px + 0.5, 2.82, pz, false);
  addBox(g, 0.03, 0.26, 1.1, sign, px, 3.06, pz + 0.5, false);
}

export const liveChunks = new Map();
export function buildChunk(i) {
  const d = getChunkData(i);
  const g = new THREE.Group();
  const disposables = [];
  const start = i * CHUNK, mid = start + CHUNK / 2;
  // ground: back sidewalk up to the houses, road, front sidewalk, foreground
  addBox(g, CHUNK, 0.2, 4.4, mat('#8a8798'), mid, -0.1, -4.4, false);
  addBox(g, CHUNK, 0.2, 5.6, mat('#2b2a33'), mid, -0.1, 0.6, false);
  addBox(g, CHUNK, 0.2, 2.6, mat('#8a8798'), mid, -0.1, 4.7, false);
  addBox(g, CHUNK, 0.2, 12, mat('#1f1e26'), mid, -0.12, 12, false);
  for (const z of [-2.2, 3.4]) addBox(g, CHUNK, 0.03, 0.12, mat('#5d5a6b'), mid, 0.005, z, false);
  for (let x = start + 0.5; x < start + CHUNK; x += 3) addBox(g, 1.4, 0.02, 0.14, mat('#e8c547'), x + 0.7, 0.005, 0.6, false);
  for (let x = start; x < start + CHUNK; x += 2) {
    addBox(g, 0.04, 0.02, 2.9, mat('#77748a'), x, 0.002, -3.65, false);
    addBox(g, 0.04, 0.02, 2.6, mat('#77748a'), x, 0.002, 4.7, false);
  }

  // streetlamp
  const lamp = mat('#15141c');
  addBox(g, 0.12, 4.2, 0.12, lamp, d.lampX, 2.1, -4.6);
  addBox(g, 0.1, 0.1, 1.0, lamp, d.lampX, 4.15, -4.15);
  addBox(g, 0.32, 0.14, 0.5, mat('#ffe3a0', { emissive: 0xffd27a, emissiveIntensity: 1.5 }), d.lampX, 4.05, -3.75, false);
  const glow = new THREE.Sprite(glowMat); glow.position.set(d.lampX, 3.9, -3.75); glow.scale.set(4, 4, 1);
  g.add(glow);

  buildRow(g, disposables, d.buildings);
  // the houses across the street: the same row turned round to face us, only shown in the behind view
  // (in the side view they would stand between the camera and the street)
  const front = new THREE.Group();
  addBox(front, CHUNK, 0.2, 1.6, mat('#8a8798'), mid, -0.1, -5.8, false);
  buildRow(front, disposables, d.frontRow);
  front.rotation.y = Math.PI;
  front.position.set(2 * mid, 0, FRONT_ROW_SHIFT);
  front.visible = showFrontRow();
  g.add(front);

  // crates and trash cans get a group each, so one can be lifted out (takeObstacle)
  const props = new Map();
  for (const o of d.obstacles) {
    if (o.taken) continue;
    if (!PICKABLE[o.type]) { buildObstacle(g, o); continue; }
    const pg = new THREE.Group();
    buildObstacle(pg, o);
    g.add(pg); props.set(o, pg);
  }
  buildManhole(g, d.manhole);
  if (d.crossing) buildCrossing(g, disposables, start, d.crossing);
  const chillers = d.homeless ? [buildHomeless(g, disposables, d.homeless)] : [];
  scene.add(g);
  liveChunks.set(i, { g, disposables, chillers, front, props });
}

// what can be picked up and thrown, and how much it weighs on landing a hit (damage, power)
export const PICKABLE = { crate: { damage: 2, power: 1.8, h: 0.7 }, trash: { damage: 2, power: 1.5, h: 0.88 } };

// the nearest crate or trash can whose side is within reach of (x, z), with its chunk index
export function pickableNear(x, z, reach) {
  let best = null, bestD = reach;
  for (let i = Math.floor((x - 2) / CHUNK); i <= Math.floor((x + 2) / CHUNK); i++) {
    for (const o of getChunkData(i).obstacles) {
      if (o.taken || !PICKABLE[o.type]) continue;
      const b = o.boxes[0];
      const d = Math.hypot(Math.max(b.x0 - x, 0, x - b.x1), Math.max(b.z0 - z, 0, z - b.z1));
      if (d < bestD) { best = { o, i }; bestD = d; }
    }
  }
  return best;
}

// lift an obstacle off the street for good: its collision boxes and meshes go
export function takeObstacle(o, i) {
  o.taken = true;
  const d = getChunkData(i);
  d.boxes = d.boxes.filter(b => !o.boxes.includes(b));
  const c = liveChunks.get(i);
  if (c && c.props.has(o)) { c.g.remove(c.props.get(o)); c.props.delete(o); }
}

export function buildRow(g, disposables, buildings) {
  for (const b of buildings) {
    if (b.type === 'brownstone') { addBrownstone(g, disposables, b); continue; }
    addBuilding(g, disposables, b.x, FACADE_Z - b.d / 2, b.w, b.h, b.d, b.variant);
    fence(g, disposables, b.x - b.w / 2, b.x + b.w / 2);
    if (b.tower && b.w > 3.5) {
      // classic New York rooftop water tower
      const tx = b.x - b.w / 2 + 1 + b.tx * (b.w - 2), tz = FACADE_Z - b.d * 0.4, ty = b.h;
      const wood = mat('#6a4a3a'), legs = mat('#15141c');
      for (const dx of [-0.6, 0.6]) for (const dz of [-0.6, 0.6]) addBox(g, 0.1, 1.2, 0.1, legs, tx + dx, ty + 0.6, tz + dz, false);
      const tank = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 1.5, 8), wood);
      tank.position.set(tx, ty + 1.95, tz); g.add(tank); disposables.push(tank.geometry);
      const roof = new THREE.Mesh(new THREE.ConeGeometry(1.0, 0.7, 8), wood);
      roof.position.set(tx, ty + 3.05, tz); g.add(roof); disposables.push(roof.geometry);
    }
  }
}

// Distant skyline chunks with the landmarks, hazy in the fog.
export function buildFarChunk(i) {
  const rnd = seeded(i * 104729 + 7);
  const g = new THREE.Group();
  const disposables = [];
  const start = i * FAR_CHUNK;
  for (let n = 0; n < 16; n++) {
    const w = 8 + rnd() * 12, h = 18 + rnd() * 60, z = -30 - rnd() * 70;
    addBuilding(g, disposables, start + rnd() * FAR_CHUNK, z, w, h, w, Math.floor(rnd() * 3));
  }
  const lx = start + FAR_CHUNK / 2, lz = -95;
  const stone = mat('#9a77a6');
  const red = mat('#ff4d4d', { emissive: 0xff2020 });
  const kind = ((i % 3) + 3) % 3;
  if (kind === 0) {
    // Empire State Building
    let y = 0;
    for (const [w, h] of [[20, 75], [15, 12], [11, 12], [7, 9], [4, 7], [2.4, 6]]) {
      addBuilding(g, disposables, lx, lz, w, h, w, 0, y);
      y += h;
    }
    addBox(g, 0.6, 22, 0.6, stone, lx, y + 11, lz, false);
    addBox(g, 1.2, 1.2, 1.2, red, lx, y + 22.5, lz, false);
  } else if (kind === 1) {
    // Chrysler Building: stepped crown and spire
    addBuilding(g, disposables, lx, lz, 14, 70, 14, 1);
    const steel = mat('#d8d0e0', { metalness: 0.6, roughness: 0.4, emissive: 0x332a33 });
    let y = 70;
    for (let k = 0; k < 6; k++) {
      const w = 12 - k * 1.7;
      addBox(g, w, 4, w, steel, lx, y + 2, lz, false);
      addBox(g, w + 0.05, 0.6, w * 0.3, mat('#ffecb4', { emissive: 0xffd88a }), lx, y + 1.5, lz, false);
      y += 4;
    }
    const spire = new THREE.Mesh(new THREE.ConeGeometry(1.4, 20, 4), steel);
    spire.position.set(lx, y + 10, lz); spire.rotation.y = Math.PI / 4;
    g.add(spire); disposables.push(spire.geometry);
  } else {
    // One World Trade Center: tapered square tower with a spire
    const glass = new THREE.MeshStandardMaterial({ color: 0x8fa8d8, metalness: 0.5, roughness: 0.3, emissive: 0x1a2440, flatShading: true });
    const tower = new THREE.Mesh(new THREE.CylinderGeometry(6, 13, 120, 4), glass);
    tower.position.set(lx, 60, lz); tower.rotation.y = Math.PI / 4;
    g.add(tower); disposables.push(tower.geometry, glass);
    addBox(g, 0.8, 35, 0.8, stone, lx, 137, lz, false);
    addBox(g, 1.4, 1.4, 1.4, red, lx, 155, lz, false);
  }
  scene.add(g);
  liveFar.set(i, { g, disposables });
}
export const liveFar = new Map();

export function syncChunks(centerX) {
  const lo = Math.floor((centerX - 60) / CHUNK), hi = Math.floor((centerX + 60) / CHUNK);
  for (let i = lo; i <= hi; i++) if (!liveChunks.has(i)) buildChunk(i);
  for (const [i, c] of liveChunks) if (i < lo - 1 || i > hi + 1) {
    scene.remove(c.g); c.disposables.forEach(d => d.dispose()); liveChunks.delete(i);
  }
  const flo = Math.floor((centerX - 330) / FAR_CHUNK), fhi = Math.floor((centerX + 330) / FAR_CHUNK);
  for (let i = flo; i <= fhi; i++) if (!liveFar.has(i)) buildFarChunk(i);
  for (const [i, c] of liveFar) if (i < flo - 1 || i > fhi + 1) {
    scene.remove(c.g); c.disposables.forEach(d => d.dispose()); liveFar.delete(i);
  }
}

// top of whatever is under a body at (x, z), given its feet are at height y
export function floorAt(x, z, y) {
  let floor = 0;
  const r = BODY_R * 0.7;
  for (const b of boxesNear(x, 4)) {
    if (x + r > b.x0 && x - r < b.x1 && z + r > b.z0 && z - r < b.z1 && b.top <= y + 0.03 && b.top > floor) floor = b.top;
  }
  return floor;
}
