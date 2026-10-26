// The street kit both 3D neighbourhoods are built from (heightsworld.js, manhattan.js): the facade tiles and
// other materials, street-name signs, and the instanced street props (trees, lamps, lanterns, hydrants, cars).
import * as THREE from 'three';
import { canvasTex } from './materials.js';
import { Batch, colorMat, instanced } from './batch.js';

// ---------- Materials ----------
export const PLAIN = colorMat();                                  // plain-coloured things that cast shadows
export const FLAT = colorMat(); FLAT.userData.cast = false;        // ground, roads, far scenery
export const ROOF = new THREE.MeshStandardMaterial({ color: '#77716a', roughness: 0.95 });
export function shade(hex, k) { const c = new THREE.Color(hex); c.offsetHSL(0, 0, k / 100); return '#' + c.getHexString(); }
export function tile(paint, stone) {
  const m = new THREE.MeshStandardMaterial({ map: canvasTex(128, paint), roughness: 0.88 });
  m.userData.stone = stone;
  return m;
}
// one bay by one floor of a facade: a window, its frame, lintel and sill, shutters, brick courses or clapboard
export function facade({ wall, brick, clap, frame = '#e7dfcc', glass = '#38424e', lintel, sill, shutters, pair, wide }) {
  return (g, n) => {
    g.fillStyle = wall; g.fillRect(0, 0, n, n);
    if (brick) { g.fillStyle = brick; for (let y = 2; y < n; y += 5) g.fillRect(0, y, n, 1); }
    if (clap) { g.fillStyle = clap; for (let y = 6; y < n; y += 9) g.fillRect(0, y, n, 2); }
    const win = (x, w) => {
      if (shutters) { g.fillStyle = shutters; g.fillRect(x - 12, 24, 10, 78); g.fillRect(x + w + 2, 24, 10, 78); }
      if (lintel) { g.fillStyle = lintel; g.fillRect(x - 5, 13, w + 10, 9); }
      g.fillStyle = frame; g.fillRect(x, 22, w, 82);
      g.fillStyle = glass; g.fillRect(x + 4, 26, w - 8, 74);
      g.fillStyle = shade(glass, 12); g.fillRect(x + 4, 26, w - 8, 14);
      g.fillStyle = frame; g.fillRect(x + 4, 60, w - 8, 4);
      if (w > 40) g.fillRect(x + w / 2 - 2, 26, 4, 74);
      if (sill) { g.fillStyle = sill; g.fillRect(x - 4, 104, w + 8, 6); }
    };
    if (pair) { win(14, 42); win(72, 42); } else if (wide) win(18, 92); else win(36, 56);
  };
}
export const BROWN = ['#7a5040', '#86553f', '#6a4636'].map(c => tile(facade({ wall: c, lintel: shade(c, -8), sill: shade(c, -6) }), c));
export const BRICK = ['#8e4a36', '#a0563f', '#7d3f30'].map((c, i) => tile(facade({ wall: c, brick: shade(c, -6), lintel: '#d8d0c0', sill: '#d8d0c0', shutters: i === 1 ? '#2f4a3a' : null }), '#7a5040'));
export const PAINT = ['#d9cfb8', '#b9c0c4', '#a9b494', '#e4e0d6'].map(c => tile(facade({ wall: c, frame: '#f6f3ec', lintel: shade(c, -10) }), '#8d877c'));
export const FRAME = ['#e8e4da', '#8aa0b4', '#c9b27a'].map(c => tile(facade({ wall: c, clap: shade(c, -9), frame: '#f7f5ef', shutters: '#2b3a4a' }), '#9a958c'));
export const APT = ['#b49b78', '#9a6e52', '#c7b9a0'].map(c => tile(facade({ wall: c, brick: shade(c, -6), pair: true, lintel: shade(c, 8), frame: '#d9d2c3' }), '#9a958c'));
export const LIME = tile((g, n) => {
  g.fillStyle = '#cfc7b4'; g.fillRect(0, 0, n, n);
  g.fillStyle = '#bdb4a0'; g.fillRect(0, 0, 8, n); g.fillRect(n - 8, 0, 8, n);
  for (const x of [20, 70]) {
    g.fillStyle = '#4c5056'; g.fillRect(x - 2, 20, 42, 86);
    g.fillStyle = '#353b43'; g.fillRect(x, 22, 38, 82);
    g.fillStyle = '#6a6f75'; g.fillRect(x + 18, 22, 2, 82); g.fillRect(x, 52, 38, 2);
  }
});
export const GLASS = tile((g, n) => {
  const gr = g.createLinearGradient(0, 0, n, n);
  gr.addColorStop(0, '#9fb3c6'); gr.addColorStop(1, '#6f8499');
  g.fillStyle = gr; g.fillRect(0, 0, n, n);
  g.fillStyle = '#5b6c7d'; g.fillRect(0, 100, n, 28);
  g.fillStyle = '#d9dee2'; g.fillRect(0, 0, 5, n); g.fillRect(0, 98, n, 4);
});
export const TAN = tile(facade({ wall: '#b8936e', pair: true, frame: '#8a7a66' }));
export const OFFICE = [LIME, GLASS, TAN, APT[2]];
export const WAREHOUSE = tile(facade({ wall: '#8a4632', brick: '#783c2b', wide: true, frame: '#3b3c3e', lintel: '#6e3727' }));
export const MARBLE = tile(facade({ wall: '#e6e2d8', frame: '#cfc9bb', lintel: '#d4cfc3', sill: '#d4cfc3', glass: '#3d4450' }));
export const gothic = (wall, glassC) => tile((g, n) => {
  g.fillStyle = wall; g.fillRect(0, 0, n, n);
  g.fillStyle = shade(wall, -8); g.fillRect(0, 0, 10, n); g.fillRect(n - 10, 0, 10, n);
  g.fillStyle = glassC;
  g.beginPath(); g.moveTo(40, 116); g.lineTo(40, 40); g.lineTo(64, 12); g.lineTo(88, 40); g.lineTo(88, 116); g.fill();
  g.fillStyle = '#b0413e'; g.fillRect(48, 60, 10, 14); g.fillStyle = '#d9b44a'; g.fillRect(70, 80, 10, 14);
  g.fillStyle = shade(wall, -14); g.fillRect(62, 30, 4, 86); g.fillRect(40, 76, 48, 3);
});
export const GOTHIC_BROWN = gothic('#6f4a3a', '#2c3a5c'), GOTHIC_BRICK = gothic('#8e4a36', '#2f3d55');
export const SHOPS = ['#7a2b2b', '#1f4a6e', '#2f5d3a', '#1e1e22'].map(band => tile((g, n) => {
  g.fillStyle = '#3a3330'; g.fillRect(0, 0, n, n);
  g.fillStyle = band; g.fillRect(0, 6, n, 22);
  g.fillStyle = '#e8e2d0'; for (let x = 16; x < 112; x += 14) g.fillRect(x, 14, 8, 6);   // lettering
  g.fillStyle = '#56636e'; g.fillRect(10, 36, 108, 92);
  g.fillStyle = '#8a98a3'; g.fillRect(10, 36, 108, 8);
  g.fillStyle = '#2b2f33'; g.fillRect(62, 36, 4, 92);
}));
export const AWNINGS = ['#8c2c2c', '#2c4c7c', '#2d6a3e', '#c9a227', '#3b3b3f', '#a0522d'];
export const GREENS = ['#4f7a35', '#5d8a3c', '#476d30', '#6b9446', '#557f3a'];
// far versions of the office tiles, which skip the shadow pass
export const FAR_TILES = OFFICE.map(m => { const f = m.clone(); f.userData = { cast: false }; return f; });
const signMats = new Map();
export function signMat(name) {
  if (!signMats.has(name)) {
    const c = document.createElement('canvas'); c.width = 256; c.height = 48;
    const g = c.getContext('2d');
    g.fillStyle = '#1d6b3c'; g.fillRect(0, 0, 256, 48);
    g.strokeStyle = '#f4f4f4'; g.lineWidth = 3; g.strokeRect(4, 4, 248, 40);
    g.fillStyle = '#f4f4f4'; g.font = 'bold 26px system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(name.toUpperCase(), 128, 26, 236);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
    signMats.set(name, new THREE.MeshStandardMaterial({ map: t, roughness: 0.6 }));
  }
  return signMats.get(name);
}

// ---------- Street props ----------
export const rgb = (color, m = PLAIN) => ({ mat: m, color });
export function template(fn) { const t = new Batch(false); fn(t); return t.merged(); }
// the parked cars' (and the traffic's) sedan, along +x with its wheels on y = 0
export const carGeo = template(t => {
  t.box(-2.2, 2.2, 0.35, 1.0, -0.88, 0.88, rgb('#ffffff'));
  t.box(-1.25, 1.0, 1.0, 1.5, -0.8, 0.8, rgb('#3a4450'));
  t.box(-1.2, 0.95, 1.5, 1.56, -0.78, 0.78, rgb('#ffffff'));
  for (const dx of [-1.4, 1.4]) for (const dz of [-0.8, 0.8]) t.box(dx - 0.34, dx + 0.34, 0, 0.68, dz - 0.14, dz + 0.14, rgb('#151515'));
  for (const dz of [-0.6, 0.6]) {
    t.box(2.2, 2.23, 0.7, 0.85, dz - 0.15, dz + 0.15, rgb('#fff3c8'));
    t.box(-2.23, -2.2, 0.7, 0.85, dz - 0.15, dz + 0.15, rgb('#b02222'));
  }
});
export const CAR_COLORS = ['#e9e7e2', '#1d1f23', '#8c9196', '#5d6b80', '#7b1f1f', '#2c3e5c', '#b8b4aa', '#3e4a3a', '#d9d6cf', '#2a2c31', '#f2c230'];
// the instanced props for lists of { x, y, z, ry, s, color } (parked cars also carry a collision box), added to
// parent; returns the meshes, and the car's geometry and material for anyone who drives one off
export function buildProps(parent, { trees = [], lamps = [], lanterns = [], hydrants = [], parked = [] }) {
  const props = {};
  const leaves = colorMat();
  const canopy = template(t => {
    const m = new THREE.Matrix4();
    for (const [x, y, z, r] of [[0, 5.4, 0, 2.7], [1.3, 4.7, 0.7, 2.0], [-1.1, 4.9, -0.9, 2.1], [0.2, 6.6, -0.3, 1.8]]) {
      t.geometry(leaves, new THREE.IcosahedronGeometry(r, 0), m.makeTranslation(x, y, z));
    }
  });
  const trunk = new THREE.CylinderGeometry(0.16, 0.24, 3.8, 6).translate(0, 1.9, 0);
  props.canopies = instanced(canopy, leaves, trees);
  props.trunks = instanced(trunk, new THREE.MeshStandardMaterial({ color: '#5a4636', roughness: 0.9 }), trees.map(({ color, ...t }) => t));
  const lampGeo = template(t => {
    t.box(-0.08, 0.08, 0, 7.2, -0.08, 0.08, rgb('#2b2d2f'));
    t.box(0, 1.8, 7.0, 7.12, -0.05, 0.05, rgb('#2b2d2f'));
    t.box(1.4, 2.2, 6.85, 7.05, -0.2, 0.2, rgb('#d9d6cc'));
  });
  props.lamps = instanced(lampGeo, colorMat(), lamps);
  const lanternGeo = template(t => {
    t.box(-0.1, 0.1, 0, 3.2, -0.1, 0.1, rgb('#1d1e20'));
    t.box(-0.28, 0.28, 3.2, 3.9, -0.28, 0.28, rgb('#efe6c8'));
    t.box(-0.34, 0.34, 3.9, 4.05, -0.34, 0.34, rgb('#1d1e20'));
  });
  props.lanterns = instanced(lanternGeo, colorMat(), lanterns);
  props.carGeo = carGeo;
  props.carMat = colorMat();
  props.parked = instanced(carGeo, props.carMat, parked.map(({ box, ...p }) => p));
  const hydrantGeo = template(t => {
    t.box(-0.13, 0.13, 0, 0.5, -0.13, 0.13, rgb('#c8302c'));
    t.box(-0.21, 0.21, 0.28, 0.38, -0.06, 0.06, rgb('#c8302c'));
    t.box(-0.09, 0.09, 0.5, 0.62, -0.09, 0.09, rgb('#8f1f1c'));
  });
  props.hydrants = instanced(hydrantGeo, colorMat(), hydrants);
  for (const k of ['canopies', 'trunks', 'lamps', 'lanterns', 'parked', 'hydrants']) parent.add(props[k]);
  return props;
}
