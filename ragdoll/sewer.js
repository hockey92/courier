// The sewer under the street: a dripping tunnel below every open manhole, leading to the turtles' lair.
// Only a rat fits down the hole. Built once and moved under whichever manhole it fell into.
import * as THREE from 'three';
import { GRAVITY } from './config.js';
import { state } from './state.js';
import { hemi, keyLight, scene, sunsetRim } from './scene.js';
import { addBox, canvasTex, crateMat, cylGeo, glowMat, mat } from './materials.js';
import { music } from './music.js';
import { dust } from './effects.js';
import { applyPose, buildTurtle, cheerPose, idlePose } from './turtles.js';

// Sewer coordinates: x is relative to the manhole, z is the street's z, y is relative to SEWER_Y.
// The tunnel runs from WEST to LAIR_X with a channel of sludge down the middle; the lair is a wider room
// from LAIR_X to EAST. The shaft comes down by the back wall at x = 0, with a ladder back up.
export const SEWER_Y = -20;
export const WEST = -14, EAST = 22, LAIR_X = 10, TUNNEL_HW = 3.05, LAIR_HW = 5.05;
export const CHANNEL_HW = 1, CHANNEL_END = 9.5, CHANNEL_FLOOR = -0.42, WATER_Y = -0.36;
export const LADDER_Z = -2.98, SHAFT_Z = -2.6;

export const sewer = { g: new THREE.Group(), ox: 0, manhole: null, boxes: [], turtles: [], visitT: 0 };
sewer.g.visible = false;
scene.add(sewer.g);

// ---------- Textures ----------
export const brickTex = canvasTex(128, (g, n) => {
  g.fillStyle = '#2f3328'; g.fillRect(0, 0, n, n);
  for (let row = 0; row < 8; row++) for (let k = -1; k < 4; k++) {
    const x = k * 32 + (row % 2) * 16, l = 34 + Math.random() * 14;
    g.fillStyle = `hsl(${85 + Math.random() * 30}, 10%, ${l * 0.75}%)`;
    g.fillRect(x + 1, row * 16 + 1, 30, 14);
  }
  g.fillStyle = 'rgba(70, 110, 40, 0.35)';                 // slime creeping down the mortar
  for (let k = 0; k < 6; k++) g.fillRect(Math.random() * n, 0, 3 + Math.random() * 4, 30 + Math.random() * 70);
});
export const concreteTex = canvasTex(64, (g, n) => {
  g.fillStyle = '#5a5c52'; g.fillRect(0, 0, n, n);
  for (let k = 0; k < 120; k++) {
    g.fillStyle = Math.random() < 0.5 ? '#4c4e45' : '#686a5f';
    g.fillRect(Math.random() * n, Math.random() * n, 2, 2);
  }
  g.strokeStyle = '#3d3f37'; g.beginPath(); g.moveTo(5, 40); g.lineTo(26, 31); g.lineTo(40, 44); g.stroke(); // crack
});
export const waterTex = canvasTex(64, (g, n) => {
  g.fillStyle = '#2d5a2a'; g.fillRect(0, 0, n, n);
  for (let k = 0; k < 14; k++) {
    g.fillStyle = Math.random() < 0.5 ? '#3f7a35' : '#24481f';
    g.fillRect(Math.random() * n, Math.random() * n, 8 + Math.random() * 18, 2);
  }
});

// a material with its own copy of tex, repeated about every `tile` metres over the box's big faces
export function tiled(tex, w, h, d, tile, extra = {}) {
  const t = tex.clone();
  const [u, v] = h <= Math.min(w, d) ? [w, d] : d <= w ? [w, h] : [d, h];
  t.repeat.set(u / tile, v / tile); t.needsUpdate = true;
  return new THREE.MeshStandardMaterial({ map: t, roughness: 0.95, flatShading: true, ...extra });
}
export function slab(w, h, d, tex, x, y, z, tile = 1.5, extra) {
  return addBox(sewer.g, w, h, d, tiled(tex, w, h, d, tile, extra), x, y, z, false);
}
// a box from (x0, y0, z0) to (x1, y1, z1), which is how the walls are easiest to think about
export function span(x0, x1, y0, y1, z0, z1, tex, tile) {
  return slab(x1 - x0, y1 - y0, z1 - z0, tex, (x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2, tile);
}
export function cyl(rTop, rBottom, h, material, x, y, z) {
  const m = new THREE.Mesh(cylGeo(rTop, rBottom, h), material);
  m.position.set(x, y, z); m.castShadow = m.receiveShadow = true;
  sewer.g.add(m);
  return m;
}

// ---------- The tunnel ----------
// solid boxes in sewer coordinates (top relative to SEWER_Y); walls are infinitely tall
export const SOLIDS = [];
const solid = (x0, x1, z0, z1, top) => SOLIDS.push({ x0, x1, z0, z1, top });
{
  const T = TUNNEL_HW, L = LAIR_HW;
  // walkways either side of the channel, the channel bed, the lair floor
  for (const s of [-1, 1]) span(WEST, CHANNEL_END, -0.5, 0, s > 0 ? CHANNEL_HW : -T, s > 0 ? T : -CHANNEL_HW, concreteTex);
  span(WEST, CHANNEL_END, -0.7, CHANNEL_FLOOR, -CHANNEL_HW, CHANNEL_HW, concreteTex);
  span(CHANNEL_END, EAST, -0.5, 0, -L, L, concreteTex, 2);
  solid(WEST, CHANNEL_END, -T, -CHANNEL_HW, 0);
  solid(WEST, CHANNEL_END, CHANNEL_HW, T, 0);
  solid(CHANNEL_END, EAST, -L, L, 0);
  for (const s of [-1, 1]) addBox(sewer.g, CHANNEL_END - WEST, 0.06, 0.1, mat('#45473f'), (WEST + CHANNEL_END) / 2, 0.03, s * (CHANNEL_HW + 0.05), false); // kerbs

  // the sludge, flowing towards the grate at the lair end
  const water = new THREE.Mesh(new THREE.BoxGeometry(CHANNEL_END - WEST, 0.02, CHANNEL_HW * 2),
    new THREE.MeshStandardMaterial({ map: waterTex, emissive: 0x0d2a10, emissiveIntensity: 1, roughness: 0.3, metalness: 0.2, flatShading: true }));
  waterTex.repeat.set((CHANNEL_END - WEST) / 2, 1);
  water.position.set((WEST + CHANNEL_END) / 2, WATER_Y, 0);
  sewer.g.add(water);
  sewer.water = water;
  for (let z = -0.85; z <= 0.86; z += 0.17) addBox(sewer.g, 0.05, 0.45, 0.05, mat('#222'), CHANNEL_END - 0.03, -0.22, z, false); // grate

  // walls: tunnel, the lair room, the step between them, the ends
  for (const s of [-1, 1]) {
    span(WEST - 0.15, LAIR_X + 0.15, -0.7, 3.5, s > 0 ? T : -T - 0.3, s > 0 ? T + 0.3 : -T, brickTex);
    span(LAIR_X - 0.15, EAST + 0.15, -0.7, 4.9, s > 0 ? L : -L - 0.3, s > 0 ? L + 0.3 : -L, brickTex);
    span(LAIR_X - 0.15, LAIR_X + 0.15, -0.7, 4.9, s > 0 ? T : -L, s > 0 ? L : -T, brickTex);
    solid(WEST - 0.15, LAIR_X + 0.15, s > 0 ? T : -T - 0.3, s > 0 ? T + 0.3 : -T, 99);
    solid(LAIR_X - 0.15, EAST + 0.15, s > 0 ? L : -L - 0.3, s > 0 ? L + 0.3 : -L, 99);
    solid(LAIR_X - 0.15, LAIR_X + 0.15, s > 0 ? T : -L, s > 0 ? L : -T, 99);
  }
  span(LAIR_X - 0.15, LAIR_X + 0.15, 3.2, 4.9, -T, T, brickTex);            // over the lair entrance
  span(WEST - 0.3, WEST, -0.7, 3.5, -T, T, brickTex);
  span(EAST, EAST + 0.3, -0.7, 4.9, -L, L, brickTex);
  solid(WEST - 0.3, WEST, -T, T, 99);
  solid(EAST, EAST + 0.3, -L, L, 99);

  // ceiling, with the shaft up to the manhole cut out of it
  const H = 0.35;
  span(WEST, -H, 3.2, 3.5, -T, T, brickTex);
  span(H, LAIR_X, 3.2, 3.5, -T, T, brickTex);
  span(-H, H, 3.2, 3.5, -T, SHAFT_Z - H, brickTex);
  span(-H, H, 3.2, 3.5, SHAFT_Z + H, T, brickTex);
  span(LAIR_X, EAST, 4.6, 4.9, -L, L, brickTex);
  // a hint of a vault in the top corners, stopping either side of the shaft
  for (const [x0, x1, s] of [[WEST, -0.5, -1], [0.5, LAIR_X, -1], [WEST, LAIR_X, 1]]) {
    addBox(sewer.g, x1 - x0, 0.5, 0.5, tiled(brickTex, x1 - x0, 0.5, 0.5, 1.5), (x0 + x1) / 2, 3.2, s * T, false).rotation.x = Math.PI / 4;
  }
  span(-H - 0.1, -H, 3.5, 5.2, SHAFT_Z - H, SHAFT_Z + H, brickTex);
  span(H, H + 0.1, 3.5, 5.2, SHAFT_Z - H, SHAFT_Z + H, brickTex);
  span(-H, H, 3.5, 5.2, SHAFT_Z - H - 0.1, SHAFT_Z - H, brickTex);
  span(-H, H, 3.5, 5.2, SHAFT_Z + H, SHAFT_Z + H + 0.1, brickTex);
  addBox(sewer.g, 0.7, 0.05, 0.7, mat('#ffe6b0', { emissive: 0xffd28a, emissiveIntensity: 1.3 }), 0, 5.15, SHAFT_Z, false); // daylight up the hole
  const beam = new THREE.Mesh(new THREE.BoxGeometry(0.6, 3.2, 0.6), new THREE.MeshBasicMaterial({
    color: 0xffe2a8, transparent: true, opacity: 0.09, blending: THREE.AdditiveBlending, depthWrite: false }));
  beam.position.set(0, 1.6, SHAFT_Z); sewer.g.add(beam);

  // the ladder back up
  const rust = mat('#5a4334', { metalness: 0.4 });
  for (const dx of [-0.2, 0.2]) addBox(sewer.g, 0.04, 5.1, 0.04, rust, dx, 2.55, LADDER_Z);
  for (let y = 0.25; y < 5.1; y += 0.3) addBox(sewer.g, 0.4, 0.035, 0.035, rust, 0, y, LADDER_Z + 0.02);

  // pipes along the walls, a big outflow at the far end
  for (const s of [-1, 1]) {
    addBox(sewer.g, LAIR_X - WEST, 0.2, 0.2, mat('#6e4a32', { metalness: 0.3 }), (WEST + LAIR_X) / 2, 2.5, s * (T - 0.15));
    addBox(sewer.g, LAIR_X - WEST, 0.12, 0.12, mat('#3f5a44', { metalness: 0.3 }), (WEST + LAIR_X) / 2, 2.15, s * (T - 0.1));
    for (let x = WEST + 1.5; x < LAIR_X; x += 3) addBox(sewer.g, 0.06, 0.5, 0.06, mat('#2a2a2a'), x, 2.4, s * (T - 0.04), false); // brackets
  }
  const outflow = cyl(0.85, 0.85, 0.4, mat('#4a4c44'), WEST + 0.15, 0.4, 0); outflow.rotation.z = Math.PI / 2;
  const inside = cyl(0.68, 0.68, 0.42, mat('#0a0d09'), WEST + 0.16, 0.4, 0); inside.rotation.z = Math.PI / 2;
  addBox(sewer.g, 0.3, 0.75, 1.1, mat('#3f7a35', { emissive: 0x123a14, transparent: true, opacity: 0.8 }), WEST + 0.35, -0.05, 0, false); // pouring out

  // caged lamps, and some tags
  for (const [x, s] of [[-9, 1], [-4, -1], [4, 1], [8, -1]]) {
    addBox(sewer.g, 0.16, 0.22, 0.1, mat('#e8f0a0', { emissive: 0xc8e070, emissiveIntensity: 1.2 }), x, 2.0, s * (T - 0.06), false);
    const glow = new THREE.Sprite(glowMat); glow.position.set(x, 2.0, s * (T - 0.3)); glow.scale.set(1.4, 1.4, 1);
    sewer.g.add(glow);
  }
  tag('PIZZA  →', '#e8c547', 3, 1.2, -T + 0.01, 0, 2.2);
  tag('←  PIZZA', '#e8c547', 5, 1.2, T - 0.01, Math.PI, 2.2);
  tag('HOME SWEET SEWER', '#7fd35a', EAST - 0.01, 2.6, 0, -Math.PI / 2, 5);
}

// spray-painted words on a wall
export function tag(text, color, x, y, z, rotY, w) {
  const c = document.createElement('canvas'); c.width = 512; c.height = 128;
  const g = c.getContext('2d');
  g.font = 'bold 76px "Marker Felt", "Comic Sans MS", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.lineWidth = 10; g.strokeStyle = '#111'; g.strokeText(text, 256, 66, 490);
  g.fillStyle = color; g.fillText(text, 256, 66, 490);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, w / 4), new THREE.MeshStandardMaterial({ map: t, transparent: true, roughness: 0.9 }));
  m.position.set(x, y, z); m.rotation.y = rotY;
  sewer.g.add(m);
}

// ---------- The lair ----------
{
  addBox(sewer.g, 3.4, 0.015, 2.4, mat('#7a3428'), 16.2, 0.008, -3.6, false);      // rug
  addBox(sewer.g, 2.6, 0.02, 2.6, mat('#4a5a7a'), 13.4, 0.01, -1.0, false);         // training mat

  // couch, facing the TV
  const cloth = mat('#8e5a2c'), cushion = mat('#b06e36');
  addBox(sewer.g, 2.3, 0.4, 0.9, cloth, 16.2, 0.2, -4.4);
  for (const x of [15.45, 16.2, 16.95]) addBox(sewer.g, 0.72, 0.12, 0.78, cushion, x, 0.46, -4.33);
  addBox(sewer.g, 0.3, 0.005, 0.25, mat('#7a4a24'), 15.35, 0.523, -4.2);            // patch
  addBox(sewer.g, 2.3, 0.6, 0.22, cloth, 16.2, 0.7, -4.75);
  for (const x of [15.05, 17.35]) addBox(sewer.g, 0.2, 0.6, 0.9, cloth, x, 0.4, -4.4);
  solid(15.0, 17.4, -4.85, -3.95, 0.52);
  solid(15.0, 17.4, -4.86, -4.64, 1.0);

  // a TV on a crate, flickering
  addBox(sewer.g, 0.7, 0.7, 0.7, crateMat, 16.2, 0.35, -2.4);
  addBox(sewer.g, 0.62, 0.5, 0.55, mat('#2a2a2e'), 16.2, 0.95, -2.4);
  sewer.screen = new THREE.MeshStandardMaterial({ color: 0x223344, emissive: 0x6fa8ff, emissiveIntensity: 1, roughness: 0.4 });
  addBox(sewer.g, 0.48, 0.36, 0.02, sewer.screen, 16.2, 0.96, -2.68, false);
  for (const s of [-1, 1]) addBox(sewer.g, 0.015, 0.45, 0.015, mat('#999'), 16.2 + s * 0.12, 1.38, -2.4).rotation.z = s * -0.4; // rabbit ears
  solid(15.85, 16.55, -2.75, -2.05, 0.7);
  solid(15.89, 16.51, -2.68, -2.12, 1.2);

  // pizza boxes: a stack of empties and one still going
  const card = mat('#efe4c8');
  for (let k = 0; k < 5; k++) addBox(sewer.g, 0.46, 0.06, 0.46, card, 18.4, 0.03 + k * 0.062, -4.3).rotation.y = Math.sin(k * 2.3) * 0.25;
  solid(18.1, 18.7, -4.6, -4.0, 0.31);
  addBox(sewer.g, 0.46, 0.04, 0.46, card, 14.6, 0.02, -3.3);
  addBox(sewer.g, 0.46, 0.46, 0.02, card, 14.6, 0.25, -3.54).rotation.x = -0.3;     // lid
  const pie = cyl(0.2, 0.2, 0.02, mat('#e8b04a'), 14.6, 0.05, -3.28);
  for (const [dx, dz] of [[0.08, 0.05], [-0.07, 0.08], [0.02, -0.1], [-0.09, -0.04]]) addBox(sewer.g, 0.05, 0.01, 0.05, mat('#b8322a'), 14.6 + dx, 0.065, -3.28 + dz);
  pie.rotation.y = 0.3;

  // skateboard
  addBox(sewer.g, 0.8, 0.03, 0.22, mat('#d6a23a'), 12.2, 0.08, 2.6);
  addBox(sewer.g, 0.78, 0.005, 0.2, mat('#222'), 12.2, 0.097, 2.6);
  for (const dx of [-0.28, 0.28]) for (const dz of [-0.08, 0.08]) addBox(sewer.g, 0.06, 0.06, 0.05, mat('#eee'), 12.2 + dx, 0.03, 2.6 + dz);

  // punching bag hanging from the ceiling
  sewer.bag = new THREE.Group(); sewer.bag.position.set(19.2, 4.6, 3.9); sewer.g.add(sewer.bag);
  addBox(sewer.bag, 0.03, 2.95, 0.03, mat('#777'), 0, -1.475, 0);
  const bag = new THREE.Mesh(cylGeo(0.22, 0.22, 1.0), mat('#8b2a22')); bag.position.y = -3.45; bag.castShadow = true;
  sewer.bag.add(bag);

  // bare bulb over the couch
  addBox(sewer.g, 0.01, 1.0, 0.01, mat('#111'), 16, 4.1, -1.0, false);
  addBox(sewer.g, 0.1, 0.14, 0.1, mat('#fff2c0', { emissive: 0xffd88a, emissiveIntensity: 2 }), 16, 3.55, -1.0, false);
  const glow = new THREE.Sprite(glowMat); glow.position.set(16, 3.55, -1.0); glow.scale.set(2.5, 2.5, 1);
  sewer.g.add(glow);
}
// in the scene rather than the group, so the number of lights never changes (that would recompile every shader)
export const bulb = new THREE.PointLight(0xffc27a, 0, 15, 1.2);
scene.add(bulb);

// ---------- The turtles ----------
export const TURTLE_HOMES = [
  { kind: 'blue', x: 13.4, z: -1.0, h: Math.PI / 2, lines: ['Welcome to the\nlair, little buddy!', 'Stay sharp\ndown here.'] },
  { kind: 'purple', x: 17.6, z: 1.2, h: Math.PI, lines: ['Fascinating\nspecimen!', 'Rattus\nnorvegicus!'] },
  { kind: 'red', x: 19.2, z: 3.05, h: Math.PI / 2, lines: ['Heh. Tough\nlittle guy.', 'Wanna spar?'] },
  { kind: 'orange', x: 16.2, z: -4.32, h: Math.PI / 2, standZ: -3.55, lines: ['Cowabunga!', 'Pizza buddy!!', 'Share the\nslice, dude?'] },
];
export const BITE_LINES = ['Ow! Respect,\nlittle dude.', 'Hey! No biting!', 'Ninja rat!'];
// [frames since the rat reached the lair, who, what]
export const GREETING = [
  [1, 'blue', 'Whoa! A visitor!'], [70, 'red', 'A rat?\nDown here?'], [140, 'purple', 'Sensei...\nis that you?'],
  [210, 'orange', 'Dude, it brought\nPIZZA!'], [280, 'orange', 'Cowabunga!'],
];
for (const [k, home] of TURTLE_HOMES.entries()) {
  const t = buildTurtle(sewer.g, home.kind);
  Object.assign(t, home, { k, px: home.x, pz: home.z, ex: 0, party: 0, ouch: 0, talkT: 0, talkCd: 0, text: '', shown: '',
    box: { x0: 0, x1: 0, z0: 0, z1: 0, top: SEWER_Y + 1.45 } });
  sewer.turtles.push(t);
}
const byKind = kind => sewer.turtles.find(t => t.kind === kind);

export const bubbleTex = new Map();
export function bubbleTexture(text) {
  if (bubbleTex.has(text)) return bubbleTex.get(text);
  const c = document.createElement('canvas'); c.width = 512; c.height = 192;
  const g = c.getContext('2d');
  g.fillStyle = '#fff'; g.strokeStyle = '#1a1a1a'; g.lineWidth = 8;
  g.beginPath(); g.roundRect(8, 8, 496, 140, 40); g.moveTo(230, 146); g.lineTo(256, 186); g.lineTo(282, 146);
  g.fill(); g.stroke();
  g.fillRect(226, 136, 60, 14);                                                          // hide the outline where the tail joins
  const rows = text.split('\n');
  g.fillStyle = '#1a1a1a'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = `bold ${rows.length > 1 ? 54 : 68}px "Marker Felt", "Comic Sans MS", sans-serif`;
  rows.forEach((row, k) => g.fillText(row, 256, 78 + (k - (rows.length - 1) / 2) * 58, 470));
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  bubbleTex.set(text, t);
  return t;
}
export function say(t, text) { t.text = text; t.talkT = 150; }

// ---------- Getting in and out ----------
export const street = {
  fog: scene.fog.color.getHex(), bg: scene.background, hemi: hemi.intensity, hemiSky: hemi.color.getHex(),
  hemiGround: hemi.groundColor.getHex(), key: keyLight.intensity, rim: sunsetRim.intensity,
};
export const sewerBg = new THREE.Color(0x0b120d);
export function setSewerMood(on) {
  scene.fog.color.set(on ? 0x101a12 : street.fog);
  scene.fog.near = on ? 3 : 10; scene.fog.far = on ? 30 : 50;   // back to the rat's-eye haze
  scene.background = on ? sewerBg : street.bg;
  hemi.intensity = on ? 0.6 : street.hemi;
  hemi.color.set(on ? 0x9ac0a2 : street.hemiSky); hemi.groundColor.set(on ? 0x1d2a1e : street.hemiGround);
  keyLight.intensity = on ? 0.35 : street.key;
  sunsetRim.intensity = on ? 0 : street.rim;
  bulb.intensity = on ? 9 : 0;
  sewer.g.visible = on;
}

export function dropIn(r, m) {
  r.hole = { m, t: 0 };
  r.speed = 0; r.vy = 0.06; r.onGround = false; // a cartoon hop of surprise before it plunges in
  music.fall();
}

export function enterSewer(r, m) {
  sewer.ox = m.x; sewer.manhole = m;
  sewer.g.position.set(m.x, SEWER_Y, 0);
  bulb.position.set(m.x + 16, SEWER_Y + 3.4, -1.0);
  sewer.boxes = SOLIDS.map(b => ({ x0: b.x0 + m.x, x1: b.x1 + m.x, z0: b.z0, z1: b.z1, top: b.top + SEWER_Y }));
  for (const t of sewer.turtles) {
    sewer.boxes.push(t.box);
    Object.assign(t, { ex: 0, party: 0, ouch: 0, talkT: 0, talkCd: 0 });
  }
  sewer.visitT = 0;
  r.hole = null; r.inSewer = true;
  r.x = m.x; r.z = SHAFT_Z + 0.2; r.y = SEWER_Y + 3.0; r.vy = 0; r.onGround = false;
  r.heading = 0; r.speed = 0;
  setSewerMood(true);
}

export function atLadder(r) {
  return Math.abs(r.x - sewer.ox) < 0.45 && r.z < SHAFT_Z + 0.4 && r.y > SEWER_Y - 0.05;
}
export function startClimb(r) {
  r.climb = { t: 0 };
  r.x = sewer.ox; r.z = LADDER_Z + 0.1; r.heading = -Math.PI / 2; r.speed = 0;
}

// back up on the street, next to the manhole and facing away from it
export function exitSewer(r) {
  const m = sewer.manhole;
  r.climb = null; r.inSewer = false;
  r.x = m.x + 0.7; r.z = m.z; r.y = 0; r.vy = 0; r.onGround = true; r.heading = 0; r.speed = 0;
  setSewerMood(false);
}

// straight back up to the street, from the sewer or halfway down the hole
export function leaveSewer(r) {
  if (r.hole) sewer.manhole = r.hole.m;
  const down = r.inSewer || r.hole;
  r.hole = r.climb = null;
  if (down) exitSewer(r);
  state.fade = 0;
}

// falling down the manhole, or climbing the ladder: no steering, the screen blacks out and we cut
export function stepTransition(r) {
  if (r.hole) {
    const h = r.hole;
    h.t++;
    r.x += (h.m.x - r.x) * 0.3; r.z += (h.m.z - r.z) * 0.3;
    r.vy -= GRAVITY; r.y += r.vy;
    state.fade = Math.min(1, Math.max(0, (h.t - 14) / 14));
    if (h.t >= 30) enterSewer(r, h.m);
  } else {
    const c = r.climb;
    c.t++;
    r.y += 0.05;
    state.fade = Math.min(1, c.t / 22);
    if (c.t >= 28) exitSewer(r);
  }
}

// keep the rat's camera inside the walls
export function sewerClamp(x, z) {
  const lx = Math.max(WEST + 0.25, Math.min(EAST - 0.25, x - sewer.ox));
  const hw = (lx > LAIR_X + 0.3 ? LAIR_HW : TUNNEL_HW) - 0.25;
  return [lx + sewer.ox, Math.max(-hw, Math.min(hw, z))];
}

export function biteTurtle(x, z) {
  for (const t of sewer.turtles) {
    if (Math.hypot(x - (sewer.ox + t.px), z - t.pz) > 0.5) continue;
    t.ouch = 24;
    say(t, BITE_LINES[Math.floor(Math.random() * BITE_LINES.length)]);
    t.talkCd = 200;
    dust(x, SEWER_Y + 0.1, z, 4);
  }
}

// ---------- Update: the turtles notice the rat, greet it and react ----------
export function updateSewer() {
  const r = state.ratPlayer;
  if (state.fade > 0 && !(r && (r.hole || r.climb))) state.fade = Math.max(0, state.fade - 0.05);
  if (!r || !r.inSewer) return;
  const lx = r.x - sewer.ox;
  if (lx > LAIR_X - 3) {
    sewer.visitT++;
    for (const [at, who, line] of GREETING) if (sewer.visitT === at) say(byKind(who), line);
    if (sewer.visitT === 280) { music.cheer(); for (const t of sewer.turtles) t.party = 160; }
  }
  for (const t of sewer.turtles) {
    const d = Math.hypot(r.x - (sewer.ox + t.px), r.z - t.pz);
    const want = sewer.visitT > 0 && (d < 2.4 || t.party > 0) ? 1 : 0;
    t.ex += (want - t.ex) * 0.06;
    t.look = lx > LAIR_X - 5 && d < 10 ? Math.atan2(r.z - t.pz, r.x - (sewer.ox + t.px)) : null;
    if (t.party > 0) t.party--;
    if (t.ouch > 0) t.ouch--;
    if (t.talkT > 0) t.talkT--;
    if (t.talkCd > 0) t.talkCd--;
    if (sewer.visitT > 330 && d < 1.5 && t.talkT <= 0 && t.talkCd <= 0) {
      say(t, t.lines[Math.floor(Math.random() * t.lines.length)]);
      t.talkCd = 360;
    }
    // the orange one gets up off the couch when he's excited
    t.px = t.x; t.pz = t.standZ ? t.z + (t.standZ - t.z) * t.ex : t.z;
    Object.assign(t.box, { x0: sewer.ox + t.px - 0.25, x1: sewer.ox + t.px + 0.25, z0: t.pz - 0.25, z1: t.pz + 0.25 });
  }
}

// ---------- Render: flowing water, flickering TV, swinging bag, posing the turtles ----------
export const lerpPose = (a, b, k) => a.map((v, i) => v + (b[i] - v) * k);
export const angleTo = (a, b) => Math.atan2(Math.sin(b - a), Math.cos(b - a));
export function renderSewer(time) {
  if (!sewer.g.visible) return;
  waterTex.offset.x = -time * 0.25;
  sewer.screen.emissiveIntensity = 0.7 + 0.3 * Math.sin(time * 23) * Math.sin(time * 7.3);
  bulb.intensity = 9 * (0.95 + 0.05 * Math.sin(time * 31));
  const red = byKind('red');
  sewer.bag.rotation.x = (1 - red.ex) * -(0.04 + 0.06 * (0.5 + 0.5 * Math.cos(2 * Math.PI * (time * 1.3 - 0.25) - 0.8)));

  for (const t of sewer.turtles) {
    const p = lerpPose(idlePose(t.kind, time + t.k), cheerPose(time, t.k * 1.7), t.ex);
    if (t.ouch > 0) { const j = Math.sin(Math.PI * t.ouch / 24); p[0] += 0.18 * j; p[1] -= 0.25 * j; }
    applyPose(t, p);
    const h = t.look === null ? t.h : t.h + angleTo(t.h, t.look) * t.ex;
    const yaw = h + p[14] * (1 - t.ex);
    t.g.position.set(t.px, 0, t.pz);
    t.g.rotation.y = -yaw;
    const headYaw = t.look === null ? 0 : Math.max(-1.1, Math.min(1.1, angleTo(yaw, t.look)));
    t.head.rotation.set(0, -headYaw, p[15]);
    t.tails.rotation.z = -0.35 - 0.15 * Math.sin(time * 7 + t.k) - 0.3 * t.ex;
    if (t.spin) t.spin.rotation.z = time * (4 + 14 * t.ex);
    if (t.staff) {
      t.staff.rotation.x = time * 8;
      t.staff.position.set(0.45 - 0.4 * t.ex, 1.0 + 0.9 * t.ex, 0);
    }
    // speech bubble
    const b = t.bubble;
    b.visible = t.talkT > 0;
    if (b.visible) {
      if (t.shown !== t.text) { b.material.map = bubbleTexture(t.text); b.material.needsUpdate = true; t.shown = t.text; }
      b.material.opacity = Math.min(1, t.talkT / 12, (150 - t.talkT) / 6);
      b.position.y = 1.95 + p[0];
    }
  }
}
