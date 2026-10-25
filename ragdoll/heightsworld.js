// Brooklyn Heights in 3D, built from the street map (heightsmap.js) with merged geometry (batch.js): the bluff,
// the blocks of brownstones, the Promenade over the BQE, Brooklyn Bridge Park and its piers, Cadman Plaza and
// Borough Hall, the Brooklyn Bridge, Manhattan across the river; and the collision boxes for all of it.
import * as THREE from 'three';
import { BODY_R, seeded } from './config.js';
import { canvasTex } from './materials.js';
import { Batch, colorMat, instanced } from './batch.js';
import {
  BLUFF, BOROUGH_HALL, BOUNDS, BQE, BRIDGE, CELLS, CURB, DESCENTS, EW, FEDERAL_COURT, LANDING, NS, ONE_BBP, PIERS,
  PLOTS, PROMENADE, SQUIBB, SUPREME_COURT, TOP, UPLAND, WALK, WAR_MEMORIAL, WF, bridgeY, squibbY,
} from './heightsmap.js';

const B0 = TOP + CURB;     // sidewalk level up in the Heights

// ---------- Collision ----------
// The game's { x0, x1, z0, z1, top } boxes, plus an optional bottom for decks you can walk under. Small boxes are
// filed in an 8 m grid; big ones (slabs, piers, the river) are few enough to check every time.
export const STEP = 0.2;      // the rise of every stair and ramp step
const CLIMB = 0.25;           // how high a ledge he walks straight up onto (a step's rise, with room for rounding)
const GRID = 8, grid = new Map(), big = [];
export const boxes = [];
export const movers = [];      // the moving cars' boxes, updated in place by heights.js
let stamp = 0;
export function solid(x0, x1, z0, z1, top, bottom) {
  const b = { x0, x1, z0, z1, top, q: 0 };
  if (bottom !== undefined) b.bottom = bottom;
  boxes.push(b);
  if (x1 - x0 > 64 || z1 - z0 > 64) { big.push(b); return b; }
  for (let i = Math.floor(x0 / GRID); i <= Math.floor(x1 / GRID); i++) {
    for (let j = Math.floor(z0 / GRID); j <= Math.floor(z1 / GRID); j++) {
      const k = i * 4096 + j;
      let cell = grid.get(k);
      if (!cell) grid.set(k, cell = []);
      cell.push(b);
    }
  }
  return b;
}
const around = (x, z, r, top) => solid(x - r, x + r, z - r, z + r, top);
export function boxesNear(x, range, z = 0) {
  const out = [], q = ++stamp;
  const x0 = x - range, x1 = x + range, z0 = z - range, z1 = z + range;
  for (const b of big) if (b.x1 > x0 && b.x0 < x1 && b.z1 > z0 && b.z0 < z1) out.push(b);
  for (let i = Math.floor(x0 / GRID); i <= Math.floor(x1 / GRID); i++) {
    for (let j = Math.floor(z0 / GRID); j <= Math.floor(z1 / GRID); j++) {
      const cell = grid.get(i * 4096 + j);
      if (cell) for (const b of cell) if (b.q !== q && b.x1 > x0 && b.x0 < x1 && b.z1 > z0 && b.z0 < z1) { b.q = q; out.push(b); }
    }
  }
  for (const b of movers) if (b.x1 > x0 && b.x0 < x1 && b.z1 > z0 && b.z0 < z1) out.push(b);
  return out;
}
// top of whatever is under a body at (x, z) with its feet at y
export function floorAt(x, z, y) {
  let floor = 0;
  const r = BODY_R * 0.7;
  for (const b of boxesNear(x, r, z)) {
    if (x + r > b.x0 && x - r < b.x1 && z + r > b.z0 && z - r < b.z1 && b.top <= y + CLIMB && b.top > floor) floor = b.top;
  }
  return floor;
}
export const HEIGHTS = { boxesNear, floorAt, zMin: -1e5, zMax: 1e5, step: CLIMB };
// is (x, y, z) inside something solid?
export function inSolid(x, y, z) {
  return boxesNear(x, 0.01, z).some(b => x > b.x0 && x < b.x1 && z > b.z0 && z < b.z1 && y < b.top && y > (b.bottom ?? -Infinity));
}

// rect minus hole, as up to four rects
function carve(rects, h) {
  const out = [];
  for (const r of rects) {
    if (h.x0 >= r.x1 || h.x1 <= r.x0 || h.z0 >= r.z1 || h.z1 <= r.z0) { out.push(r); continue; }
    if (h.x0 > r.x0) out.push({ ...r, x1: h.x0 });
    if (h.x1 < r.x1) out.push({ ...r, x0: h.x1 });
    const x0 = Math.max(r.x0, h.x0), x1 = Math.min(r.x1, h.x1);
    if (h.z0 > r.z0) out.push({ ...r, x0, x1, z1: h.z0 });
    if (h.z1 < r.z1) out.push({ ...r, x0, x1, z0: h.z1 });
  }
  return out;
}
const overlap = (a, b) => a.x0 < b.x1 && a.x1 > b.x0 && a.z0 < b.z1 && a.z1 > b.z0;

// ---------- Materials ----------
const PLAIN = colorMat();                                  // plain-coloured things that cast shadows
const FLAT = colorMat(); FLAT.userData.cast = false;        // ground, roads, far scenery
const ROOF = new THREE.MeshStandardMaterial({ color: '#77716a', roughness: 0.95 });
function shade(hex, k) { const c = new THREE.Color(hex); c.offsetHSL(0, 0, k / 100); return '#' + c.getHexString(); }
function tile(paint, stone) {
  const m = new THREE.MeshStandardMaterial({ map: canvasTex(128, paint), roughness: 0.88 });
  m.userData.stone = stone;
  return m;
}
// one bay by one floor of a facade: a window, its frame, lintel and sill, shutters, brick courses or clapboard
function facade({ wall, brick, clap, frame = '#e7dfcc', glass = '#38424e', lintel, sill, shutters, pair, wide }) {
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
const BROWN = ['#7a5040', '#86553f', '#6a4636'].map(c => tile(facade({ wall: c, lintel: shade(c, -8), sill: shade(c, -6) }), c));
const BRICK = ['#8e4a36', '#a0563f', '#7d3f30'].map((c, i) => tile(facade({ wall: c, brick: shade(c, -6), lintel: '#d8d0c0', sill: '#d8d0c0', shutters: i === 1 ? '#2f4a3a' : null }), '#7a5040'));
const PAINT = ['#d9cfb8', '#b9c0c4', '#a9b494', '#e4e0d6'].map(c => tile(facade({ wall: c, frame: '#f6f3ec', lintel: shade(c, -10) }), '#8d877c'));
const FRAME = ['#e8e4da', '#8aa0b4', '#c9b27a'].map(c => tile(facade({ wall: c, clap: shade(c, -9), frame: '#f7f5ef', shutters: '#2b3a4a' }), '#9a958c'));
const APT = ['#b49b78', '#9a6e52', '#c7b9a0'].map(c => tile(facade({ wall: c, brick: shade(c, -6), pair: true, lintel: shade(c, 8), frame: '#d9d2c3' }), '#9a958c'));
const LIME = tile((g, n) => {
  g.fillStyle = '#cfc7b4'; g.fillRect(0, 0, n, n);
  g.fillStyle = '#bdb4a0'; g.fillRect(0, 0, 8, n); g.fillRect(n - 8, 0, 8, n);
  for (const x of [20, 70]) {
    g.fillStyle = '#4c5056'; g.fillRect(x - 2, 20, 42, 86);
    g.fillStyle = '#353b43'; g.fillRect(x, 22, 38, 82);
    g.fillStyle = '#6a6f75'; g.fillRect(x + 18, 22, 2, 82); g.fillRect(x, 52, 38, 2);
  }
});
const GLASS = tile((g, n) => {
  const gr = g.createLinearGradient(0, 0, n, n);
  gr.addColorStop(0, '#9fb3c6'); gr.addColorStop(1, '#6f8499');
  g.fillStyle = gr; g.fillRect(0, 0, n, n);
  g.fillStyle = '#5b6c7d'; g.fillRect(0, 100, n, 28);
  g.fillStyle = '#d9dee2'; g.fillRect(0, 0, 5, n); g.fillRect(0, 98, n, 4);
});
const TAN = tile(facade({ wall: '#b8936e', pair: true, frame: '#8a7a66' }));
const OFFICE = [LIME, GLASS, TAN, APT[2]];
const WAREHOUSE = tile(facade({ wall: '#8a4632', brick: '#783c2b', wide: true, frame: '#3b3c3e', lintel: '#6e3727' }));
const MARBLE = tile(facade({ wall: '#e6e2d8', frame: '#cfc9bb', lintel: '#d4cfc3', sill: '#d4cfc3', glass: '#3d4450' }));
const gothic = (wall, glassC) => tile((g, n) => {
  g.fillStyle = wall; g.fillRect(0, 0, n, n);
  g.fillStyle = shade(wall, -8); g.fillRect(0, 0, 10, n); g.fillRect(n - 10, 0, 10, n);
  g.fillStyle = glassC;
  g.beginPath(); g.moveTo(40, 116); g.lineTo(40, 40); g.lineTo(64, 12); g.lineTo(88, 40); g.lineTo(88, 116); g.fill();
  g.fillStyle = '#b0413e'; g.fillRect(48, 60, 10, 14); g.fillStyle = '#d9b44a'; g.fillRect(70, 80, 10, 14);
  g.fillStyle = shade(wall, -14); g.fillRect(62, 30, 4, 86); g.fillRect(40, 76, 48, 3);
});
const GOTHIC_BROWN = gothic('#6f4a3a', '#2c3a5c'), GOTHIC_BRICK = gothic('#8e4a36', '#2f3d55');
const SHOPS = ['#7a2b2b', '#1f4a6e', '#2f5d3a', '#1e1e22'].map(band => tile((g, n) => {
  g.fillStyle = '#3a3330'; g.fillRect(0, 0, n, n);
  g.fillStyle = band; g.fillRect(0, 6, n, 22);
  g.fillStyle = '#e8e2d0'; for (let x = 16; x < 112; x += 14) g.fillRect(x, 14, 8, 6);   // lettering
  g.fillStyle = '#56636e'; g.fillRect(10, 36, 108, 92);
  g.fillStyle = '#8a98a3'; g.fillRect(10, 36, 108, 8);
  g.fillStyle = '#2b2f33'; g.fillRect(62, 36, 4, 92);
}));
const AWNINGS = ['#8c2c2c', '#2c4c7c', '#2d6a3e', '#c9a227', '#3b3b3f', '#a0522d'];
const GREENS = ['#4f7a35', '#5d8a3c', '#476d30', '#6b9446', '#557f3a'];
// far versions of the office tiles, which skip the shadow pass
const FAR_TILES = OFFICE.map(m => { const f = m.clone(); f.userData = { cast: false }; return f; });
const signMats = new Map();
function signMat(name) {
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

// ---------- Helpers ----------
const B = new Batch();
const rgb = (color, m = PLAIN) => ({ mat: m, color });
const bx = (r, y0, y1, o) => B.box(r.x0, r.x1, y0, y1, r.z0, r.z1, o);
const M4 = new THREE.Matrix4(), Q = new THREE.Quaternion(), V = new THREE.Vector3(), S1 = new THREE.Vector3(1, 1, 1);
// any geometry, placed at (x, y, z), turned ry, scaled s (a number or [sx, sy, sz])
function shape(geo, color, x, y, z, ry = 0, s = 1, m = PLAIN) {
  Q.setFromAxisAngle(V.set(0, 1, 0), ry);
  const sc = Array.isArray(s) ? new THREE.Vector3(...s) : S1.clone().multiplyScalar(s);
  B.geometry(m, geo, M4.compose(new THREE.Vector3(x, y, z), Q, sc), color);
}
const CYL = new THREE.CylinderGeometry(1, 1, 1, 10), CYL8 = new THREE.CylinderGeometry(1, 1, 1, 8);
const CONE4 = new THREE.ConeGeometry(1, 1, 4).rotateY(Math.PI / 4), CONE8 = new THREE.ConeGeometry(1, 1, 8);
const DOME = new THREE.SphereGeometry(1, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2);
const cyl = (color, x, y0, y1, z, r, m) => shape(CYL, color, x, (y0 + y1) / 2, z, 0, [r, y1 - y0, r], m);

// instanced props, gathered as the blocks are built
const trees = [], lamps = [], hydrants = [], lanterns = [];
export const parked = [];     // { x, y, z, ry, color, box }; box: its collision, until someone drives it off
function tree(x, y, z, s = 1, blocks = true) {
  trees.push({ x, y, z, s, ry: (x * 7 + z * 13) % 6.28, color: GREENS[Math.abs(Math.round(x * 3 + z)) % GREENS.length] });
  if (blocks) around(x, z, 0.22 * s, y + 3 * s);
}
function template(fn) { const t = new Batch(false); fn(t); return t.merged(); }

// ---------- The Heights: the plateau, the descents and the blocks ----------
function plateau() {
  let top = [{ x0: 0, x1: BOUNDS.x1, z0: BOUNDS.z0, z1: BOUNDS.z1 }];
  for (const d of DESCENTS) top = carve(top, { x0: -20, x1: d.xTop, z0: d.z0, z1: d.z1 });
  for (const p of top) {
    bx(p, 0, TOP, { mat: FLAT, color: '#8b8478', topColor: '#56585d' });
    solid(p.x0, p.x1, p.z0, p.z1, TOP);
  }
  // the streets running down off the bluff: a slope you see, steps of STEP you walk
  for (const d of DESCENTS) {
    const n = Math.round((TOP - WF) / STEP), len = (d.xTop - d.xBottom) / n;
    for (let k = 0; k < n; k++) solid(d.xBottom + k * len, d.xBottom + (k + 1) * len, d.z0, d.z1, WF + (k + 1) * STEP);
    B.prism(FLAT, 'z', d.z0, d.z1, [[d.xBottom, WF + 0.05], [d.xTop, TOP + 0.05], [d.xTop, 0], [d.xBottom, 0]], d.name === 'Joralemon St' ? '#6e6a64' : '#56585d');
    // railings along the drop on both sides
    for (const z of [d.z0 - 0.15, d.z1 + 0.15]) {
      B.box(0, d.xTop - 4, B0 + 1.0, B0 + 1.08, z - 0.04, z + 0.04, rgb('#1d1e20'));
      for (let x = 0; x < d.xTop - 4; x += 2.5) B.box(x, x + 0.06, B0, B0 + 1.05, z - 0.03, z + 0.03, rgb('#1d1e20'));
      solid(0, d.xTop - 4, z - 0.1, z + 0.1, B0 + 1.2);
    }
  }
}

// which way a row of houses faces, and its local frame: u along the row, d into the lot from the building line
function rectOf(c, side, ua, ub, da, db) {
  switch (side) {
    case 'n': return { x0: ua, x1: ub, z0: c.lz0 + da, z1: c.lz0 + db };
    case 's': return { x0: ua, x1: ub, z0: c.lz1 - db, z1: c.lz1 - da };
    case 'w': return { x0: c.lx0 + da, x1: c.lx0 + db, z0: ua, z1: ub };
    default: return { x0: c.lx1 - db, x1: c.lx1 - da, z0: ua, z1: ub };
  }
}
function wedge(c, side, ua, ub, pts, color) {
  const perp = { n: d => c.lz0 + d, s: d => c.lz1 - d, w: d => c.lx0 + d, e: d => c.lx1 - d }[side];
  B.prism(PLAIN, side === 'n' || side === 's' ? 'x' : 'z', ua, ub, pts.map(([d, y]) => [perp(d), y]), color);
}

const STYLES = {
  brownstone: { w: [5.4, 7.2], floors: [4, 4], tiles: BROWN, stoop: 1, cornice: '#2e2622' },
  brick: { w: [5.6, 7.6], floors: [3, 4], tiles: BRICK, stoop: 0.6, cornice: '#e6e0d2' },
  painted: { w: [5.2, 7], floors: [3, 4], tiles: PAINT, stoop: 0.5, cornice: '#f2efe8' },
  frame: { w: [5.2, 7], floors: [2, 3], tiles: FRAME, cornice: '#f2efe8' },
  apartment: { w: [14, 24], floors: [6, 12], tiles: APT, cornice: '#c9bfae', canopy: true, tank: 0.6 },
  tower: { w: [24, 40], floors: [12, 24], tiles: APT, cornice: '#c9bfae', canopy: true, setback: true },
  shop: { w: [6, 10], floors: [2, 4], tiles: [...BROWN, ...BRICK, ...PAINT], shop: true, cornice: '#2e2622' },
  office: { w: [18, 34], floors: [8, 22], tiles: OFFICE, cornice: '#cfc7b4', fl: 3.6, bay: 2.2, setback: true },
  warehouse: { w: [18, 36], floors: [3, 6], tiles: [WAREHOUSE], cornice: '#6a3b2c', fl: 3.8, bay: 3 },
};
const S = STYLES;
const OFFICE_STREETS = ['Court St', 'Adams St', 'Boerum Pl', 'Cadman Plaza E', 'Tillary St'];
// what gets built along a street: how deep the lots are, and a pick of style for each house
function streetStyle(st, c) {
  const n = st.name;
  if (c.kind === 'dumbo') return { depth: 10, pick: () => S.warehouse };
  if (c.kind === 'downtown') return { depth: 24, pick: () => S.office };
  if (n === 'Montague St' || n === 'Atlantic Ave') return { depth: 15, pick: () => S.shop };
  if (OFFICE_STREETS.includes(n) || (n === 'Joralemon St' && c.x0 >= 470)) return { depth: 22, pick: () => S.office };
  if (n === 'Cadman Plaza W') return { depth: 20, pick: () => S.tower };
  if (n === 'Old Fulton St') return { depth: 14, pick: () => S.warehouse };
  const north = c.z1 <= -530, busy = n === 'Henry St' || n === 'Clinton St' || n === 'Clark St';
  return {
    depth: 13,
    pick: rnd => {
      const r = rnd();
      if (north && r < 0.3) return S.frame;
      return r < (busy ? 0.16 : 0.07) ? S.apartment : r < 0.52 ? S.brownstone : r < 0.78 ? S.brick : S.painted;
    },
  };
}

function house(c, side, u0, u1, depth, st, rnd, keepTile) {
  const w = u1 - u0, fl = st.fl || 3.3;
  const t = keepTile || st.tiles[Math.floor(rnd() * st.tiles.length)];
  let floors = st.floors[0] + Math.floor(rnd() * (st.floors[1] - st.floors[0] + 1));
  if (c.kind === 'downtown') floors += Math.floor(rnd() * 8);
  const tw = w / Math.max(1, Math.round(w / (st.bay || 2.1)));
  const R = rectOf(c, side, u0, u1, 0, depth);
  let y = B0;
  if (st.shop) {
    bx(R, y, y + 4.2, { mat: SHOPS[Math.floor(rnd() * SHOPS.length)], tw: w / Math.max(1, Math.round(w / 3)), th: 4.2 });
    y += 4.2;
    wedge(c, side, u0 + 0.3, u1 - 0.3, [[0, B0 + 3.7], [-1.5, B0 + 2.95], [-1.5, B0 + 2.8], [0, B0 + 3.5]], AWNINGS[Math.floor(rnd() * AWNINGS.length)]);
  }
  const h = floors * fl;
  let front = y + h;
  if (st.setback && floors > 14 && w > 12 && depth > 12) {
    front = y + 12 * fl;
    bx(R, y, front, { mat: t, top: ROOF, tw, th: fl });
    const R2 = rectOf(c, side, u0 + 3, u1 - 3, 4, depth - 2);
    bx(R2, front, y + h, { mat: t, top: ROOF, tw, th: fl });
    solid(R2.x0, R2.x1, R2.z0, R2.z1, y + h);
    bx(rectOf(c, side, u0 + 6, u1 - 6, 7, depth - 5), y + h, y + h + 4, rgb('#6f6a63'));          // mechanicals
  } else {
    bx(R, y, front, { mat: t, top: ROOF, tw, th: fl });
  }
  solid(R.x0, R.x1, R.z0, R.z1, front);
  bx(rectOf(c, side, u0, u1, -0.4, 0.4), front - 0.7, front + 0.05, rgb(st.cornice));                // cornice
  const uc = w < 9 ? (rnd() < 0.5 ? u0 + 1.5 : u1 - 1.5) : (u0 + u1) / 2;
  const stone = t.userData.stone || '#7a5040', iron = '#1c1c1e';
  if (st.stoop && rnd() < st.stoop && w > 4.5) {
    // brownstone stoop: seven steps up to the parlour floor, a balustrade each side, the areaway's iron fence
    for (let k = 0; k < 7; k++) {
      const r = rectOf(c, side, uc - 0.95, uc + 0.95, -2.4 + k * 0.3, 0);
      bx(r, B0, B0 + (k + 1) * 0.2, rgb(stone));
      solid(r.x0, r.x1, r.z0, r.z1, B0 + (k + 1) * 0.2);
    }
    for (const [a, b] of [[uc - 1.15, uc - 0.95], [uc + 0.95, uc + 1.15]]) {
      wedge(c, side, a, b, [[-2.4, B0], [-2.4, B0 + 0.95], [0, B0 + 2.35], [0, B0]], shade(stone, -6));
    }
    bx(rectOf(c, side, uc - 0.6, uc + 0.6, -0.08, 0), B0 + 1.4, B0 + 3.9, rgb('#3b2a20'));              // door
    for (const [a, b] of [[u0 + 0.1, uc - 1.15], [uc + 1.15, u1 - 0.1]]) {
      if (b - a < 0.4) continue;
      const r = rectOf(c, side, a, b, -2.45, -2.38);
      bx(r, B0, B0 + 1.0, rgb(iron));
      solid(r.x0, r.x1, r.z0, r.z1, B0 + 1.0);
    }
  } else if (!st.shop) {
    const door = st === S.office || st === S.tower || st === S.apartment ? 1.2 : 0.6;
    bx(rectOf(c, side, uc - door, uc + door, -0.08, 0), B0, B0 + 2.6, rgb(st === S.office ? '#2a3038' : '#3b2a20'));
    if (st.canopy) {
      bx(rectOf(c, side, uc - 1.3, uc + 1.3, -3.3, 0), B0 + 2.9, B0 + 3.1, rgb('#24433a'));
      for (const u of [uc - 1.2, uc + 1.2]) bx(rectOf(c, side, u - 0.04, u + 0.04, -3.25, -3.17), B0, B0 + 2.9, rgb('#b8a66a'));
    }
  }
  if (st.tank && rnd() < st.tank) {
    // a rooftop water tower on its steel legs
    const r = rectOf(c, side, (u0 + u1) / 2 - 1, (u0 + u1) / 2 + 1, depth * 0.55, depth * 0.55 + 2);
    const tx = (r.x0 + r.x1) / 2, tz = (r.z0 + r.z1) / 2;
    for (const dx of [-0.8, 0.8]) for (const dz of [-0.8, 0.8]) B.box(tx + dx - 0.06, tx + dx + 0.06, front, front + 1.6, tz + dz - 0.06, tz + dz + 0.06, rgb(iron));
    cyl('#6a4a3a', tx, front + 1.6, front + 3.8, tz, 1.25);
    shape(CONE8, '#5a3e30', tx, front + 4.25, tz, 0, [1.35, 0.9, 1.35]);
  }
  return t;
}

function fillRow(c, side, u0, u1, depth, ss, rnd) {
  let u = u0, prev = null, prevTile = null;
  while (u1 - u > 0.5) {
    const st = prev && rnd() < 0.55 ? prev : ss.pick(rnd);
    let w = st.w[0] + rnd() * (st.w[1] - st.w[0]);
    const left = u1 - u;
    if (w > left || left - w < 4) w = left;
    if (!PLOTS.some(p => overlap(p, rectOf(c, side, u, u + w, 0, depth)))) prevTile = house(c, side, u, u + w, depth, st, rnd, st === prev ? prevTile : null);
    prev = st; u += w;
  }
}

// the sidewalk side of a cell facing a street: where its curb runs and which way the road is
function curbs(c) {
  const out = [];
  for (const [side, st] of Object.entries(c.front)) {
    if (side === 'n') out.push({ st, along: 'x', curb: c.sz0, out: -1, a0: c.sx0, a1: c.sx1 });
    if (side === 's') out.push({ st, along: 'x', curb: c.sz1, out: 1, a0: c.sx0, a1: c.sx1 });
    if (side === 'w') out.push({ st, along: 'z', curb: c.sx0, out: -1, a0: c.sz0, a1: c.sz1 });
    if (side === 'e') out.push({ st, along: 'z', curb: c.sx1, out: 1, a0: c.sz0, a1: c.sz1 });
  }
  return out;
}
// a point by a curb: a along it, off out into the road (negative is up on the sidewalk)
const curbPt = (k, a, off) => k.along === 'x' ? [a, k.curb + k.out * off] : [k.curb + k.out * off, a];
const CAR_COLORS = ['#e9e7e2', '#1d1f23', '#8c9196', '#5d6b80', '#7b1f1f', '#2c3e5c', '#b8b4aa', '#3e4a3a', '#d9d6cf', '#2a2c31', '#f2c230'];

function streetFurniture(c, rnd) {
  for (const k of curbs(c)) {
    const len = k.a1 - k.a0;
    for (let a = k.a0 + 7 + rnd() * 3; a < k.a1 - 6; a += 9 + rnd() * 4) {
      const [x, z] = curbPt(k, a, -0.9);
      tree(x, B0, z, 0.85 + rnd() * 0.4);
    }
    for (let a = k.a0 + 12; a < k.a1 - 8; a += 34) {
      const [x, z] = curbPt(k, a, -0.45);
      const ry = k.along === 'x' ? (k.out < 0 ? Math.PI / 2 : -Math.PI / 2) : (k.out < 0 ? Math.PI : 0);
      lamps.push({ x, y: B0, z, ry });
      around(x, z, 0.09, B0 + 7);
    }
    if (len > 30) {
      const [x, z] = curbPt(k, k.a0 + 9, -0.6);
      hydrants.push({ x, y: B0, z });
      around(x, z, 0.18, B0 + 0.7);
    }
    // parked cars along the curb
    for (let a = k.a0 + 10; a < k.a1 - 10; a += 6.2 + rnd() * 1.6) {
      if (rnd() < 0.18) continue;
      const [x, z] = curbPt(k, a, 1.15);
      const ry = k.along === 'x' ? (k.out < 0 ? 0 : Math.PI) : (k.out < 0 ? -Math.PI / 2 : Math.PI / 2);
      const color = CAR_COLORS[Math.floor(rnd() * CAR_COLORS.length)];
      const box = k.along === 'x' ? solid(x - 2.2, x + 2.2, z - 0.9, z + 0.9, TOP + 1.5) : solid(x - 0.9, x + 0.9, z - 2.2, z + 2.2, TOP + 1.5);
      parked.push({ x, y: TOP, z, ry, color, box });
    }
  }
}

function lawn(r, y = B0, color = '#6a9448') { bx(r, y, y + 0.03, rgb(color, FLAT)); }
function paving(r, y = B0, color = '#c4beb2') { bx(r, y, y + 0.02, rgb(color, FLAT)); }
const lot = c => ({ x0: c.lx0, x1: c.lx1, z0: c.lz0, z1: c.lz1 });

function buildCell(c, rnd) {
  const slab = { x0: c.sx0, x1: c.sx1, z0: c.sz0, z1: c.sz1 };
  bx(slab, TOP, B0, { mat: FLAT, color: '#aca79e', topColor: '#b4afa6' });
  solid(slab.x0, slab.x1, slab.z0, slab.z1, B0);
  if (c.kind !== 'bridge') streetFurniture(c, rnd);
  const L = lot(c), lw = L.x1 - L.x0, ld = L.z1 - L.z0;
  if (lw < 3 || ld < 3) return;
  if (c.kind === 'squibb') return squibbPark(L, rnd);
  if (c.kind === 'watchtower') return watchtower(L);
  if (c.kind === 'cadman') return lawn(L);
  if (c.kind === 'bridge' || c.kind === 'courts' || c.kind === 'borough') return paving(L);
  const f = { ...c.front };
  if (c.kind === 'dumbo') { delete f.n; delete f.w; delete f.e; }
  if (f.n && f.s && ld < 18) delete f[f.n.r >= f.s.r ? 's' : 'n'];
  if (f.w && f.e && lw < 18) delete f[f.w.r >= f.e.r ? 'e' : 'w'];
  if (!Object.keys(f).length) {
    // nothing faces a street: a garden
    lawn(L, B0, '#668c45');
    for (let k = 0; k < lw * ld / 300; k++) tree(L.x0 + 3 + rnd() * (lw - 6), B0, L.z0 + 3 + rnd() * (ld - 6), 0.9 + rnd() * 0.6);
    return;
  }
  lawn(L, B0, '#647f45');                                                   // back yards
  const dep = side => f[side] ? Math.min(streetStyle(f[side], c).depth, (side === 'n' || side === 's') ? (f.n && f.s ? ld / 2 : ld) : (f.w && f.e ? lw / 2 : lw)) : 0;
  const dn = dep('n'), ds = dep('s'), dw = dep('w'), de = dep('e');
  if (f.n) fillRow(c, 'n', L.x0, L.x1, dn, streetStyle(f.n, c), rnd);
  if (f.s) fillRow(c, 's', L.x0, L.x1, ds, streetStyle(f.s, c), rnd);
  if (f.w && ld - dn - ds > 3) fillRow(c, 'w', L.z0 + dn, L.z1 - ds, dw, streetStyle(f.w, c), rnd);
  if (f.e && ld - dn - ds > 3) fillRow(c, 'e', L.z0 + dn, L.z1 - ds, de, streetStyle(f.e, c), rnd);
  // a tree or two in the yards
  const ix0 = L.x0 + dw + 2, ix1 = L.x1 - de - 2, iz0 = L.z0 + dn + 2, iz1 = L.z1 - ds - 2;
  if (ix1 - ix0 > 6 && iz1 - iz0 > 6) {
    for (let k = 0; k < (ix1 - ix0) * (iz1 - iz0) / 500; k++) tree(ix0 + rnd() * (ix1 - ix0), B0, iz0 + rnd() * (iz1 - iz0), 0.8 + rnd() * 0.5, false);
  }
}

function signs() {
  const post = '#2c3a30';
  for (const s of NS) {
    for (const t of EW) {
      if (t.z < s.z0 || t.z > s.z1 || s.x < t.x0 || s.x > t.x1) continue;
      const px = s.x + s.r + 0.5, pz = t.z + t.r + 0.5;
      if (px < 0) continue;
      B.box(px - 0.06, px + 0.06, B0, B0 + 3.6, pz - 0.06, pz + 0.06, rgb(post));
      around(px, pz, 0.08, B0 + 3.6);
      B.box(px + 0.08, px + 1.4, B0 + 3.25, B0 + 3.5, pz - 0.02, pz + 0.02, { mat: signMat(t.name), tw: 1.32, th: 0.25 });
      B.box(px - 0.02, px + 0.02, B0 + 2.95, B0 + 3.2, pz + 0.08, pz + 1.4, { mat: signMat(s.name), tw: 1.32, th: 0.25 });
    }
  }
}

// ---------- Landmark buildings ----------
function plots() {
  for (const p of PLOTS) {
    if (p.kind === 'church') { church(p); continue; }
    const m = p.color === 'brick' ? APT[1] : p.color === 'glass' ? GLASS : LIME, fl = 3.4;
    const low = Math.min(p.h, 42), i = 4;
    const r2 = { x0: p.x0 + i, x1: p.x1 - i, z0: p.z0 + i, z1: p.z1 - i };
    bx(p, B0, B0 + low, { mat: m, top: ROOF, tw: 2.2, th: fl });
    bx({ x0: p.x0 - 0.4, x1: p.x1 + 0.4, z0: p.z0 - 0.4, z1: p.z1 + 0.4 }, B0 + low - 0.8, B0 + low, rgb('#bdb4a0'));
    bx(r2, B0 + low, B0 + p.h, { mat: m, top: ROOF, tw: 2.2, th: fl });
    bx({ x0: p.x0 + 10, x1: p.x1 - 10, z0: p.z0 + 10, z1: p.z1 - 10 }, B0 + p.h, B0 + p.h + 6, rgb('#6f6a63'));
    solid(p.x0, p.x1, p.z0, p.z1, B0 + low);
    solid(r2.x0, r2.x1, r2.z0, r2.z1, B0 + p.h);
    if (p.name === 'Hotel St. George') {
      // its sign on the roof, facing the harbour
      bx({ x0: p.x0 + 4, x1: p.x0 + 4.3, z0: p.z0 + 8, z1: p.z1 - 8 }, B0 + p.h, B0 + p.h + 5, rgb('#b23a2e'));
    }
  }
}
function church(p) {
  const wall = 15, mid = (p.x0 + p.x1) / 2, w = p.x1 - p.x0;
  const stone = p.tower ? GOTHIC_BROWN : GOTHIC_BRICK;
  bx(p, B0, B0 + wall, { mat: stone, top: ROOF, tw: 5, th: wall });
  B.prism(PLAIN, 'z', p.z0, p.z1, [[p.x0 - 0.5, B0 + wall], [p.x1 + 0.5, B0 + wall], [mid, B0 + wall + w * 0.42]], '#4b4f55');
  solid(p.x0, p.x1, p.z0, p.z1, B0 + wall);
  if (p.tower) {
    // a square Gothic tower at the front corner, with pinnacles round its spire
    const tz0 = p.front === 'n' ? p.z0 : p.z1 - 10, tx1 = p.x1, tx0 = tx1 - 10;
    const T = { x0: tx0, x1: tx1, z0: tz0, z1: tz0 + 10 };
    bx(T, B0, B0 + 34, { mat: stone, top: ROOF, tw: 5, th: 15 });
    solid(T.x0, T.x1, T.z0, T.z1, B0 + 34);
    for (const x of [T.x0 + 0.6, T.x1 - 0.6]) for (const z of [T.z0 + 0.6, T.z1 - 0.6]) shape(CONE4, '#5e3f32', x, B0 + 36, z, 0, [0.9, 4, 0.9]);
    shape(CONE4, '#4b4f55', (T.x0 + T.x1) / 2, B0 + 40, (T.z0 + T.z1) / 2, 0, [6, 12, 6]);
  }
}

function watchtower(L) {
  // the big brick printing works at the foot of Columbia Heights, its back wall going right down the bluff
  const r = { x0: BLUFF, x1: L.x1, z0: L.z0, z1: L.z0 + 52 };
  bx(r, WF, B0 + 44, { mat: WAREHOUSE, top: ROOF, tw: 3, th: 3.8 });
  solid(0, r.x1, r.z0, r.z1, B0 + 44);
  bx({ x0: BLUFF - 0.5, x1: L.x1 + 0.5, z0: r.z0 - 0.5, z1: r.z1 + 0.5 }, B0 + 43, B0 + 44.2, rgb('#6a3b2c'));
  lawn({ x0: L.x0, x1: L.x1, z0: r.z1, z1: L.z1 });
}
function squibbPark(L, rnd) {
  paving(L, B0, '#b9b2a4');
  lawn({ x0: L.x0 + 2, x1: L.x1 - 2, z0: L.z0 + 2, z1: SQUIBB.z0 - 4 });
  for (let k = 0; k < 8; k++) tree(L.x0 + 4 + rnd() * (L.x1 - L.x0 - 8), B0, L.z0 + 4 + rnd() * (SQUIBB.z0 - L.z0 - 10), 1 + rnd() * 0.4);
  // the path from Columbia Heights to the footbridge
  paving({ x0: 0, x1: L.x1, z0: SQUIBB.z0, z1: SQUIBB.z1 }, B0, '#9c8a6e');
}

function civic(rnd) {
  // Cadman Plaza Park: lawns, a long allée of planes, the War Memorial at its north end
  const park = { x0: 572.5, x1: 747, z0: -748, z1: -274 };
  paving({ x0: 654, x1: 666, z0: park.z0, z1: park.z1 }, B0 + 0.03, '#cfc6b2');
  for (const z of [-600, -450, -330]) paving({ x0: park.x0, x1: park.x1, z0: z - 3, z1: z + 3 }, B0 + 0.03, '#cfc6b2');
  for (let z = park.z0 + 8; z < park.z1 - 4; z += 13) for (const x of [649, 671]) tree(x, B0, z, 1.25);
  for (let k = 0; k < 40; k++) {
    const x = park.x0 + 8 + rnd() * (park.x1 - park.x0 - 16), z = park.z0 + 40 + rnd() * (park.z1 - park.z0 - 50);
    if (Math.abs(x - 660) > 18) tree(x, B0, z, 1 + rnd() * 0.5);
  }
  const W = WAR_MEMORIAL;
  paving({ x0: W.x0 - 10, x1: W.x1 + 10, z0: W.z1, z1: W.z1 + 26 }, B0 + 0.03, '#d6d0c2');
  bx(W, B0, B0 + 9, { mat: MARBLE, top: ROOF, tw: 3.3, th: 9 });
  bx({ x0: W.x0 - 0.4, x1: W.x1 + 0.4, z0: W.z0 - 0.4, z1: W.z1 + 0.4 }, B0 + 8.4, B0 + 9.4, rgb('#d8d3c6'));
  solid(W.x0, W.x1, W.z0, W.z1, B0 + 9.4);
  for (const x of [W.x0 + 6, W.x1 - 6]) {
    // the two heroic figures on their plinths
    bx({ x0: x - 2, x1: x + 2, z0: W.z1 + 1, z1: W.z1 + 5 }, B0, B0 + 3, rgb('#cfc9bb'));
    solid(x - 2, x + 2, W.z1 + 1, W.z1 + 5, B0 + 3);
    bx({ x0: x - 0.7, x1: x + 0.7, z0: W.z1 + 2.4, z1: W.z1 + 3.6 }, B0 + 3, B0 + 8, rgb('#bdb6a6'));
    bx({ x0: x - 0.45, x1: x + 0.45, z0: W.z1 + 2.55, z1: W.z1 + 3.45 }, B0 + 8, B0 + 9, rgb('#bdb6a6'));
  }

  // the courts: New York State Supreme Court with its colonnade, the Federal Courthouse's tower
  const SC = SUPREME_COURT;
  bx(SC, B0, B0 + 26, { mat: LIME, top: ROOF, tw: 4.3, th: 3.6 });
  solid(SC.x0, SC.x1, SC.z0, SC.z1, B0 + 26);
  bx({ x0: SC.x0 - 8, x1: SC.x0, z0: SC.z0 + 10, z1: SC.z1 - 10 }, B0, B0 + 1.6, rgb('#cfc9bb'));      // podium
  solid(SC.x0 - 8, SC.x0, SC.z0 + 10, SC.z1 - 10, B0 + 1.6);
  for (let k = 0; k < 4; k++) {                                                                       // its steps
    const x0 = SC.x0 - 8 - (k + 1) * 0.4;
    bx({ x0, x1: x0 + 0.4, z0: SC.z0 + 12, z1: SC.z1 - 12 }, B0, B0 + 1.6 - (k + 1) * 0.32, rgb('#cfc9bb'));
    solid(x0, x0 + 0.4, SC.z0 + 12, SC.z1 - 12, B0 + 1.6 - (k + 1) * 0.32);
  }
  for (let z = SC.z0 + 12; z <= SC.z1 - 12; z += 5.5) {
    cyl('#e2ddd0', SC.x0 - 6.5, B0 + 1.6, B0 + 19, z, 0.75);
    around(SC.x0 - 6.5, z, 0.75, B0 + 19);
  }
  bx({ x0: SC.x0 - 8, x1: SC.x0, z0: SC.z0 + 10, z1: SC.z1 - 10 }, B0 + 19, B0 + 21.5, rgb('#d8d3c6'));
  const FC = FEDERAL_COURT;
  bx(FC, B0, B0 + 10, { mat: LIME, top: ROOF, tw: 4.3, th: 3.6 });
  bx({ x0: FC.x0 + 6, x1: FC.x1 - 6, z0: FC.z0 + 8, z1: FC.z1 - 8 }, B0 + 10, B0 + 62, { mat: GLASS, top: ROOF, tw: 1.5, th: 3.8 });
  solid(FC.x0, FC.x1, FC.z0, FC.z1, B0 + 10);
  paving({ x0: 572.5, x1: 746, z0: -246, z1: -10 }, B0 + 0.02, '#c9c3b6');

  // Columbus Park: lawns, planes, Columbus and Beecher on their pedestals, and Borough Hall at the end
  lawn({ x0: 590, x1: 640, z0: 0, z1: 170 }, B0 + 0.02);
  lawn({ x0: 680, x1: 735, z0: 0, z1: 170 }, B0 + 0.02);
  for (let z = 6; z < 170; z += 14) for (const x of [596, 634, 686, 729]) tree(x, B0, z, 1.2);
  for (const [z, h] of [[40, 4], [125, 3]]) {
    bx({ x0: 657, x1: 663, z0: z - 3, z1: z + 3 }, B0, B0 + h, rgb('#a9a296'));
    solid(657, 663, z - 3, z + 3, B0 + h);
    bx({ x0: 659, x1: 661, z0: z - 0.8, z1: z + 0.8 }, B0 + h, B0 + h + 3.2, rgb('#3f5a4a'));   // bronze figure
    bx({ x0: 659.3, x1: 660.7, z0: z - 0.6, z1: z + 0.6 }, B0 + h + 3.2, B0 + h + 3.8, rgb('#3f5a4a'));
  }
  const BH = BOROUGH_HALL, bhx = (BH.x0 + BH.x1) / 2;
  bx(BH, B0, B0 + 18, { mat: MARBLE, top: ROOF, tw: 3.3, th: 4.5 });
  bx({ x0: BH.x0 - 0.5, x1: BH.x1 + 0.5, z0: BH.z0 - 0.5, z1: BH.z1 + 0.5 }, B0 + 17, B0 + 18.6, rgb('#ece8de'));
  solid(BH.x0, BH.x1, BH.z0, BH.z1, B0 + 18.6);
  // its portico on the park side: six columns, a pediment, a flight of steps
  const pz0 = BH.z0 - 7;
  bx({ x0: bhx - 15, x1: bhx + 15, z0: pz0, z1: BH.z0 }, B0, B0 + 2.4, rgb('#e6e2d8'));
  solid(bhx - 15, bhx + 15, pz0, BH.z0, B0 + 2.4);
  for (let k = 0; k < 12; k++) {
    const z0 = pz0 - (k + 1) * 0.35;
    bx({ x0: bhx - 13, x1: bhx + 13, z0, z1: z0 + 0.35 }, B0, B0 + 2.4 - (k + 1) * 0.2, rgb('#e6e2d8'));
    solid(bhx - 13, bhx + 13, z0, z0 + 0.35, B0 + 2.4 - (k + 1) * 0.2);
  }
  for (let k = 0; k < 6; k++) {
    const x = bhx - 12.5 + k * 5;
    cyl('#f1eee6', x, B0 + 2.4, B0 + 15.5, pz0 + 1.5, 0.8);
    around(x, pz0 + 1.5, 0.8, B0 + 15.5);
  }
  bx({ x0: bhx - 14.5, x1: bhx + 14.5, z0: pz0, z1: BH.z0 }, B0 + 15.5, B0 + 17.5, rgb('#ece8de'));
  B.prism(PLAIN, 'z', pz0, BH.z0 + 2, [[bhx - 15, B0 + 17.5], [bhx + 15, B0 + 17.5], [bhx, B0 + 22]], '#e9e5db');
  // the cupola: drum, dome, lantern, and Justice on top
  const cz = (BH.z0 + BH.z1) / 2 + 4;
  shape(CYL8, '#eeeae1', bhx, B0 + 21.5, cz, 0, [6, 6, 6]);
  shape(CYL8, '#e2ddd2', bhx, B0 + 24.8, cz, 0, [6.4, 0.6, 6.4]);
  shape(DOME, '#c9c3b8', bhx, B0 + 25.1, cz, 0, [5.2, 4.2, 5.2]);
  shape(CYL8, '#eeeae1', bhx, B0 + 30.3, cz, 0, [1.4, 2.4, 1.4]);
  shape(CONE8, '#8a8f8a', bhx, B0 + 32.2, cz, 0, [1.5, 1.4, 1.5]);
  bx({ x0: bhx - 0.3, x1: bhx + 0.3, z0: cz - 0.3, z1: cz + 0.3 }, B0 + 32.9, B0 + 34.6, rgb('#b89a4a'));
  // subway entrances by Court St: a railed stair down, a green globe either side
  for (const z of [20, 150]) {
    const r = { x0: 576, x1: 579, z0: z - 4, z1: z + 4 };
    bx(r, B0, B0 + 0.05, rgb('#151618'));
    for (const [x0, x1, z0, z1] of [[r.x0 - 0.1, r.x0, r.z0, r.z1], [r.x1, r.x1 + 0.1, r.z0, r.z1], [r.x0, r.x1, r.z1, r.z1 + 0.1]]) {
      B.box(x0, x1, B0, B0 + 1.0, z0, z1, rgb('#2a5a3a'));
    }
    solid(r.x0 - 0.1, r.x1 + 0.1, r.z0, r.z1 + 0.1, B0 + 1.0);
    for (const x of [r.x0 - 0.05, r.x1 + 0.05]) {
      B.box(x - 0.06, x + 0.06, B0, B0 + 2.6, r.z0 - 0.06, r.z0 + 0.06, rgb('#2a5a3a'));
      shape(DOME, '#4fbf6a', x, B0 + 2.6, r.z0, 0, [0.3, 0.3, 0.3]);
      shape(DOME, '#4fbf6a', x, B0 + 2.6, r.z0, 0, [0.3, -0.3, 0.3]);
    }
  }
}

// ---------- The bluff: the Promenade, the BQE's triple cantilever, the drop to Furman St ----------
function bluff(rnd) {
  const P = PROMENADE, iron = '#1d1e20';
  // the railing along the whole bluff, broken where the streets run down and where the footbridge starts
  let wall = [{ x0: BLUFF - 0.6, x1: BLUFF, z0: BOUNDS.z0, z1: BOUNDS.z1 }];
  for (const d of DESCENTS) wall = carve(wall, { x0: -30, x1: 10, z0: d.z0, z1: d.z1 });
  wall = carve(wall, { x0: -30, x1: 10, z0: SQUIBB.z0, z1: SQUIBB.z1 });
  for (const r of wall) solid(r.x0, r.x1, r.z0, r.z1, TOP + 6);
  solid(BLUFF - 0.6, BLUFF, SQUIBB.z0, SQUIBB.z1, squibbY(BLUFF) - 1.4);
  // the strip along the edge that isn't the Promenade: hedges up top, a retaining wall down to Furman St
  let strip = [{ x0: BLUFF, x1: 0, z0: BOUNDS.z0, z1: BOUNDS.z1 }];
  strip = carve(strip, P);
  for (const d of DESCENTS) strip = carve(strip, { x0: -30, x1: 10, z0: d.z0, z1: d.z1 });
  strip = carve(strip, { x0: -30, x1: 10, z0: SQUIBB.z0, z1: SQUIBB.z1 });
  for (const zc of [BQE.z0, BQE.z1]) strip = strip.flatMap(r => zc > r.z0 && zc < r.z1 ? [{ ...r, z1: zc }, { ...r, z0: zc }] : [r]);
  for (const r of strip) {
    solid(r.x0, r.x1, r.z0, r.z1, TOP + 6);
    const inBqe = r.z0 >= BQE.z0 && r.z1 <= BQE.z1;
    if (inBqe) bx(r, TOP - 0.8, TOP, rgb('#a3a09a', FLAT));
    else bx(r, WF, TOP, { mat: FLAT, color: '#8f887b', topColor: '#5d7a3e' });
    for (let z = r.z0; z < r.z1 - 1; z += 3 + rnd() * 3) {
      const z1 = Math.min(r.z1, z + 2 + rnd() * 3);
      B.box(BLUFF + 0.5, -0.5, TOP, TOP + 1 + rnd() * 1.4, z, z1, rgb(GREENS[Math.floor(rnd() * 5)]));
    }
    if (!inBqe) for (let z = r.z0; z < r.z1 - 2; z += 4 + rnd() * 6) {
      // ivy down the wall
      B.box(BLUFF - 0.12, BLUFF, WF + rnd() * 6, TOP - rnd() * 3, z, Math.min(r.z1, z + 2 + rnd() * 4), rgb('#4b6b35'));
    }
  }
  // the Promenade: hexagon pavers, the iron railing, benches facing Manhattan, lanterns, the garden strip
  bx(P, TOP - 0.8, TOP, { mat: FLAT, color: '#a3a09a', topColor: '#8e8a83' });
  solid(P.x0, P.x1, P.z0, P.z1, TOP);
  bx({ x0: -3.2, x1: 0, z0: P.z0, z1: P.z1 }, TOP, TOP + 0.45, rgb('#6b5a48'));
  solid(-3.2, 0, P.z0, P.z1, TOP + 0.45);
  for (let z = P.z0; z < P.z1 - 1; z += 2 + rnd() * 2.5) B.box(-2.9, -0.3, TOP + 0.45, TOP + 1.2 + rnd() * 1.5, z, z + 1.5 + rnd() * 2, rgb(GREENS[Math.floor(rnd() * 5)]));
  for (let z = P.z0 + 6; z < P.z1; z += 17) tree(-1.6, TOP + 0.45, z, 1.1);
  for (const y of [0.5, 1.05]) B.box(BLUFF + 0.05, BLUFF + 0.18, TOP + y, TOP + y + 0.07, P.z0, P.z1, rgb(iron));
  for (let z = P.z0; z < P.z1; z += 2) B.box(BLUFF + 0.08, BLUFF + 0.15, TOP, TOP + 1.1, z, z + 0.07, rgb(iron));
  for (let z = P.z0 + 8; z < P.z1 - 4; z += 12) {
    B.box(-13.9, -13.3, TOP + 0.42, TOP + 0.5, z, z + 2.2, rgb('#5a4630'));                         // seat
    B.box(-13.3, -13.2, TOP + 0.5, TOP + 1.0, z, z + 2.2, rgb('#5a4630'));                          // back
    for (const dz of [0.2, 2]) B.box(-13.85, -13.25, TOP, TOP + 0.42, z + dz - 0.05, z + dz + 0.05, rgb(iron));
    solid(-13.9, -13.2, z, z + 2.2, TOP + 0.5);
  }
  for (let z = P.z0 + 14; z < P.z1; z += 24) { lanterns.push({ x: -4.2, y: TOP, z }); around(-4.2, z, 0.1, TOP + 4); }

  // the BQE: two decks of highway hanging off the bluff under the Promenade, in and out of tunnels
  const grey = '#a3a09a';
  bx({ x0: -0.6, x1: 0, z0: BQE.z0, z1: BQE.z1 }, WF, TOP - 0.8, rgb(grey, FLAT));
  for (const y of [...BQE.decks, TOP]) {
    if (y !== TOP) {
      bx({ x0: BLUFF, x1: 0, z0: BQE.z0, z1: BQE.z1 }, y - 0.8, y, { mat: PLAIN, color: grey, topColor: '#4f5156' });
      B.box(BLUFF, BLUFF + 0.4, y, y + 1.0, BQE.z0, BQE.z1, rgb('#b5b2ab'));                         // parapet
      for (let z = BQE.z0; z < BQE.z1; z += 9) B.box(-8.1, -7.9, y + 0.005, y + 0.01, z, z + 3, rgb('#e8e6df'));
    }
    for (let z = BQE.z0 + 4; z < BQE.z1; z += 12) {
      // the cantilever brackets
      B.prism(PLAIN, 'z', z, z + 0.7, [[0, y - 0.8], [BLUFF + 1, y - 0.8], [0, y - 3.6]], grey);
    }
  }
  for (const z of [BQE.z0, BQE.z1]) for (const y of BQE.decks) B.box(-15, -1, y, y + 4.4, z - 0.3, z + 0.3, rgb('#121314'));

  // the Squibb Park footbridge: timber deck on steel legs, down to Pier 1
  const sq = SQUIBB, n = Math.round((TOP - WF) / STEP), len = (sq.xTop - sq.xBottom) / n;
  solid(BLUFF, 0, sq.z0, sq.z1, B0);
  bx({ x0: BLUFF, x1: 0, z0: sq.z0, z1: sq.z1 }, TOP - 0.6, B0, rgb('#9c8a6e'));
  for (let k = 0; k < n; k++) {
    const x0 = sq.xBottom + k * len, y = WF + CURB + (k + 1) * STEP;
    solid(x0, x0 + len, sq.z0, sq.z1, y, y - 0.8);
    for (const z of [sq.z0 - 0.3, sq.z1 + 0.3]) solid(x0, x0 + len, z - 0.3, z + 0.3, y + 5, y - 0.8);
  }
  B.prism(PLAIN, 'z', sq.z0, sq.z1, [[sq.xBottom, WF + CURB], [sq.xTop, B0], [sq.xTop, B0 - 0.6], [sq.xBottom, WF + CURB - 0.6]], '#9c8a6e');
  for (const z of [sq.z0 - 0.05, sq.z1 + 0.05]) {
    B.prism(PLAIN, 'z', z - 0.05, z + 0.05, [[sq.xBottom, WF + CURB + 1.1], [sq.xTop, B0 + 1.1], [sq.xTop, B0 + 0.9], [sq.xBottom, WF + CURB + 0.9]], '#6f5c42');
  }
  for (let x = sq.xBottom + 10; x < sq.xTop - 2; x += 10) {
    const y = squibbY(x) - 0.6;
    for (const z of [sq.z0 + 0.2, sq.z1 - 0.2]) B.box(x - 0.15, x + 0.15, WF, y, z - 0.15, z + 0.15, rgb('#5b5f63'));
  }
}

// ---------- The waterfront: Furman St, Brooklyn Bridge Park, the piers, the river ----------
function waterfront(rnd) {
  for (const r of [UPLAND, LANDING, ...PIERS]) bx(r, 0, WF, { mat: FLAT, color: '#77736b', topColor: '#9a958c' });
  // Furman St and its sidewalks
  bx({ x0: -29, x1: -19, z0: LANDING.z0, z1: UPLAND.z1 }, WF, WF + 0.01, rgb('#56585d', FLAT));
  solid(-29, -19, LANDING.z0, UPLAND.z1, WF);
  let east = [{ x0: -19, x1: BLUFF, z0: LANDING.z0, z1: UPLAND.z1 }];
  for (const d of DESCENTS) east = carve(east, { x0: -30, x1: 10, z0: d.z0, z1: d.z1 });
  for (const r of east) { bx(r, WF, WF + CURB, rgb('#aca79e', FLAT)); solid(r.x0, r.x1, r.z0, r.z1, WF + CURB); }
  for (const d of DESCENTS) bx({ x0: -19, x1: BLUFF, z0: d.z0, z1: d.z1 }, WF, WF + 0.01, rgb('#56585d', FLAT));
  // the park: lawns along Furman St, a path down the middle and one along the water
  const park = { x0: UPLAND.x0, x1: -29, z0: UPLAND.z0, z1: UPLAND.z1 };
  solid(park.x0, park.x1, park.z0, park.z1, WF + CURB);
  bx(park, WF, WF + CURB, rgb('#6e9a4a', FLAT));
  bx({ x0: -34, x1: -29, z0: park.z0, z1: park.z1 }, WF + CURB, WF + CURB + 0.01, rgb('#aca79e', FLAT));
  bx({ x0: -64, x1: -58, z0: park.z0, z1: park.z1 }, WF + CURB, WF + CURB + 0.02, rgb('#cdbf9f', FLAT));
  bx({ x0: -110, x1: -104, z0: park.z0, z1: park.z1 }, WF + CURB, WF + CURB + 0.02, rgb('#bdb3a0', FLAT));
  const L = LANDING;
  solid(L.x0, -29, L.z0, L.z1, WF + CURB);
  bx({ x0: L.x0, x1: -29, z0: L.z0, z1: L.z1 }, WF, WF + CURB, rgb('#b8b0a2', FLAT));
  for (let z = park.z0 + 6; z < park.z1; z += 12) tree(-40, WF + CURB, z, 1.1 + rnd() * 0.3);
  for (let k = 0; k < 120; k++) {
    const x = -100 + rnd() * 32, z = park.z0 + rnd() * (park.z1 - park.z0);
    if (z > ONE_BBP.z0 - 6 && z < ONE_BBP.z1 + 6) continue;
    if (z > SQUIBB.z0 - 3 && z < SQUIBB.z1 + 3) continue;
    if (Math.abs(x + 61) > 4) tree(x, WF + CURB, z, 0.9 + rnd() * 0.5);
  }
  // One Brooklyn Bridge Park, the old warehouse on Furman St
  const O = ONE_BBP;
  bx(O, WF + CURB, WF + CURB + O.h, { mat: WAREHOUSE, top: ROOF, tw: 3, th: 3.8 });
  solid(O.x0, O.x1, O.z0, O.z1, WF + CURB + O.h);
  bx({ x0: O.x0 - 0.5, x1: O.x1 + 0.5, z0: O.z0 - 0.5, z1: O.z1 + 0.5 }, WF + CURB + O.h - 1, WF + CURB + O.h + 0.3, rgb('#6a3b2c'));
  // the piers
  const deck = WF + CURB;
  for (const p of PIERS) {
    solid(p.x0, p.x1, p.z0, p.z1, deck);
    bx(p, WF, deck, rgb('#9f998e', FLAT));
    const inner = { x0: p.x0 + 6, x1: p.x1 - 4, z0: p.z0 + 6, z1: p.z1 - 6 };
    if (p.name === 'Pier 2') {
      // the sports courts under their great steel shed
      for (let k = 0; k < 6; k++) bx({ x0: inner.x0 + k * 30, x1: inner.x0 + k * 30 + 26, z0: inner.z0 + 4, z1: inner.z1 - 4 }, deck, deck + 0.02, rgb(k % 2 ? '#3b6ea8' : '#4f8a4f', FLAT));
      bx({ x0: inner.x0 - 2, x1: inner.x1 + 2, z0: inner.z0, z1: inner.z1 }, deck + 13, deck + 13.6, rgb('#8d9298'));
      for (let x = inner.x0; x <= inner.x1; x += 20) for (const z of [inner.z0 + 1, inner.z1 - 1]) {
        B.box(x - 0.3, x + 0.3, deck, deck + 13, z - 0.3, z + 0.3, rgb('#5b6067'));
        around(x, z, 0.3, deck + 13);
      }
    } else if (p.name === 'Pier 5') {
      // turf pitches, lined in white, with their floodlights
      bx(inner, deck, deck + 0.02, rgb('#4f9a45', FLAT));
      for (let x = inner.x0 + 70; x < inner.x1; x += 70) B.box(x - 0.1, x + 0.1, deck + 0.02, deck + 0.03, inner.z0, inner.z1, rgb('#f2f2f2', FLAT));
      for (const z of [inner.z0 + 0.1, inner.z1 - 0.1]) B.box(inner.x0, inner.x1, deck + 0.02, deck + 0.03, z - 0.1, z + 0.1, rgb('#f2f2f2', FLAT));
      for (let x = inner.x0; x <= inner.x1; x += 55) for (const z of [inner.z0 - 2, inner.z1 + 2]) {
        B.box(x - 0.2, x + 0.2, deck, deck + 18, z - 0.2, z + 0.2, rgb('#6d7177'));
        B.box(x - 1.2, x + 1.2, deck + 18, deck + 19, z - 0.4, z + 0.4, rgb('#d9d9d4'));
        around(x, z, 0.2, deck + 18);
      }
    } else {
      // lawns and trees (Pier 1's hills, Pier 3's green, Pier 6's playgrounds)
      bx(inner, deck, deck + 0.03, rgb('#6a9a48', FLAT));
      for (let k = 0; k < (inner.x1 - inner.x0) * (inner.z1 - inner.z0) / 450; k++) {
        tree(inner.x0 + 4 + rnd() * (inner.x1 - inner.x0 - 8), deck, inner.z0 + 4 + rnd() * (inner.z1 - inner.z0 - 8), 1 + rnd() * 0.5);
      }
      if (p.name === 'Pier 6') {
        for (const [x, z, c] of [[-160, 420, '#d94f3a'], [-175, 440, '#e8b52f'], [-150, 455, '#3a78c9']]) {
          B.box(x - 3, x + 3, deck, deck + 2.5, z - 3, z + 3, rgb(c)); solid(x - 3, x + 3, z - 3, z + 3, deck + 2.5);
        }
      }
    }
    // railings round the water's edge
    for (const [x0, x1, z0, z1] of [[p.x0, p.x1, p.z0, p.z0 + 0.1], [p.x0, p.x1, p.z1 - 0.1, p.z1], [p.x0, p.x0 + 0.1, p.z0, p.z1]]) {
      B.box(x0, x1, deck + 1.0, deck + 1.08, z0, z1, rgb('#2a2b2d'));
    }
  }
  // the edge of the park between the piers
  let edge = [{ x0: UPLAND.x0, x1: UPLAND.x0 + 0.1, z0: UPLAND.z0, z1: UPLAND.z1 }];
  for (const p of PIERS) edge = carve(edge, { x0: -400, x1: 0, z0: p.z0, z1: p.z1 });
  for (const r of edge) B.box(r.x0, r.x1, deck + 1.0, deck + 1.08, r.z0, r.z1, rgb('#2a2b2d'));
  // the river: solid to anyone at the waterfront, a long way under the bridge
  let water = [{ x0: BOUNDS.x0 - 500, x1: BLUFF, z0: BOUNDS.z0 - 200, z1: BOUNDS.z1 + 200 }];
  for (const r of [UPLAND, LANDING, ...PIERS]) water = carve(water, r);
  for (const r of water) solid(r.x0, r.x1, r.z0, r.z1, WF + 8);
}
export function onLand(x, z) {
  if (x >= 0 && x <= BOUNDS.x1 && z >= BOUNDS.z0 && z <= BOUNDS.z1) return true;
  if (x >= BLUFF && x <= 0 && z >= PROMENADE.z0 && z <= PROMENADE.z1) return true;
  return [UPLAND, LANDING, ...PIERS].some(r => x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1);
}

// ---------- The Brooklyn Bridge ----------
const LINES = [];   // suspenders and stays: [x0, y0, z0, x1, y1, z1]
function brooklynBridge() {
  const Z = BRIDGE.z, granite = '#b3a994', steel = '#5b5650', plank = '#8a6d4c';
  const xs = [BRIDGE.xStart, BRIDGE.xRamp, BRIDGE.xTower2, -1100];
  // roadway decks either side, the raised walkway in the middle, the truss underneath
  for (let i = 0; i < xs.length - 1; i++) {
    const a = xs[i], b = xs[i + 1], ya = bridgeY(a), yb = bridgeY(b);
    B.prism(PLAIN, 'z', Z - 13, Z + 13, [[a, ya - 3], [b, yb - 3], [b, yb - 5.5], [a, ya - 5.5]], steel);
    for (const z of [Z - 8.5, Z + 8.5]) B.prism(FLAT, 'z', z - 4.3, z + 4.3, [[a, ya - 2.98], [b, yb - 2.98], [b, yb - 3.1], [a, ya - 3.1]], '#4e5055');
    B.prism(PLAIN, 'z', Z - BRIDGE.walk, Z + BRIDGE.walk, [[a, ya], [b, yb], [b, yb - 0.5], [a, ya - 0.5]], plank);
    for (const z of [Z - BRIDGE.walk, Z + BRIDGE.walk]) {
      B.prism(PLAIN, 'z', z - 0.06, z + 0.06, [[a, ya + 1.1], [b, yb + 1.1], [b, yb + 0.95], [a, ya + 0.95]], '#3b3d40');
    }
    for (const z of [Z - 13, Z + 13]) B.prism(PLAIN, 'z', z - 0.1, z + 0.1, [[a, ya - 1.9], [b, yb - 1.9], [b, yb - 3], [a, ya - 3]], steel);
  }
  // the masonry approach over the land: piers and arches every 40 m
  for (let x = BRIDGE.xStart - 70; x > -10; x -= 40) {
    const yb = x > 0 ? TOP : WF;
    if (bridgeY(x) - 5.5 < yb + 1) continue;
    B.box(x - 4, x + 4, yb, bridgeY(x) - 5.5, Z - 13, Z + 13, rgb(granite));
    solid(x - 4, x + 4, Z - 13, Z + 13, bridgeY(x) - 5.5);
  }
  // the Brooklyn anchorage
  B.box(55, 120, TOP, bridgeY(55) - 2, Z - 18, Z + 18, rgb(granite));
  solid(55, 120, Z - 18, Z + 18, bridgeY(55) - 2);

  // walking it: steps up the approach, the platform round the tower, level across to the Manhattan tower
  const n = Math.round((BRIDGE.deck - TOP) / STEP), len = (BRIDGE.xStart - BRIDGE.xRamp) / n;
  const w = BRIDGE.walk;
  const T1 = BRIDGE.xTower, T2 = BRIDGE.xTower2, deck = BRIDGE.deck;
  for (let k = 0; k < n; k++) {
    const x1 = BRIDGE.xStart - k * len, x0 = x1 - len, y = TOP + (k + 1) * STEP;
    solid(x0, x1, Z - w, Z + w, y, y - 1);
    for (const z of [Z - w - 0.3, Z + w + 0.3]) solid(x0, x1, z - 0.3, z + 0.3, y + 6, y - 1);
    // near the start the roadways either side are too low to walk under
    if (y - 5.5 < TOP + 2) for (const [z0, z1] of [[Z - 13, Z - w - 0.6], [Z + w + 0.6, Z + 13]]) solid(x0, x1, z0, z1, Math.max(TOP, y - 3));
  }
  solid(T2 + 9, T1 - 24, Z - w, Z + w, deck, deck - 1);
  solid(T1 - 24, T1 + 24, Z - 13, Z + 13, deck, deck - 1);                         // platform round the tower
  for (const z of [Z - 13.6, Z + 13.6]) solid(T1 - 24, T1 + 24, z - 0.3, z + 0.3, deck + 6, deck - 1);
  for (const x of [T1 - 24.3, T1 + 24.3]) for (const [z0, z1] of [[Z - 13.9, Z - w], [Z + w, Z + 13.9]]) solid(x - 0.3, x + 0.3, z0, z1, deck + 6, deck - 1);
  for (const z of [Z - w - 0.3, Z + w + 0.3]) solid(T2 + 9, T1 - 24, z - 0.3, z + 0.3, deck + 6, deck - 1);
  B.box(T1 - 24, T1 + 24, deck - 0.5, deck, Z - 13, Z + 13, rgb(plank));
  solid(T2 + 2, T2 + 9, Z - w, Z + w, deck + 30);                                    // as far as it goes

  // the towers: granite, two pointed Gothic arches each
  for (const tx of [T1, T2]) {
    const x0 = tx - 9, x1 = tx + 9, top = 84, spring = deck + 22, apex = deck + 31;
    B.box(x0 - 3, x1 + 3, 0, deck - 3, Z - 26, Z + 26, rgb(granite));
    for (const [z0, z1] of [[Z - 22, Z - 13], [Z - 3, Z + 3], [Z + 13, Z + 22]]) B.box(x0, x1, deck - 3, top, z0, z1, rgb(granite));
    solid(x0, x1, Z - 22, Z - 13, top); solid(x0, x1, Z - 3, Z + 3, top); solid(x0, x1, Z + 13, Z + 22, top);
    B.box(x0, x1, apex, top, Z - 22, Z + 22, rgb(granite));
    for (const [z0, z1] of [[Z - 13, Z - 3], [Z + 3, Z + 13]]) {
      const zm = (z0 + z1) / 2;
      B.prism(PLAIN, 'x', x0, x1, [[z0, spring], [z0, apex], [zm, apex]], granite);
      B.prism(PLAIN, 'x', x0, x1, [[z1, spring], [zm, apex], [z1, apex]], granite);
    }
    B.box(x0 - 0.6, x1 + 0.6, top - 1.5, top, Z - 22.6, Z + 22.6, rgb('#a39a86'));
    for (const z of [Z - 13, Z - 3, Z + 3, Z + 13]) B.box(x0 - 0.3, x1 + 0.3, top - 10, top - 9.4, z - 0.4, z + 0.4, rgb('#a39a86'));
  }

  // the four main cables, sagging across the span and down to the anchorages, with suspenders and stays
  const sag = (a, ya, b, yb, s) => x => { const t = (x - a) / (b - a); return ya + (yb - ya) * t - s * 4 * t * (1 - t); };
  const parts = [[-980, T2, sag(-980, 30, T2, 82, 12)], [T2, T1, sag(T2, 82, T1, 82, 82 - deck - 2)], [T1, 90, sag(T1, 82, 90, bridgeY(90) + 1, 12)]];
  const cableY = x => { for (const [a, b, f] of parts) if (x >= a && x <= b) return f(x); return 0; };
  const cableMat = new THREE.MeshStandardMaterial({ color: '#4a4c50', roughness: 0.7 });
  for (const z of [Z - 13, Z - 3.6, Z + 3.6, Z + 13]) {
    const pts = [];
    for (let x = -980; x <= 90; x += 10) pts.push(new THREE.Vector3(x, cableY(x), z));
    const tube = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 220, 0.45, 6), cableMat);
    tube.castShadow = true;
    bridgeGroup.add(tube);
    for (let x = -975; x < 85; x += 5) {
      if (Math.abs(x - T1) < 10 || Math.abs(x - T2) < 10) continue;
      const y0 = Math.min(bridgeY(x) - (Math.abs(z - Z) > 6 ? 2.9 : -1.1), cableY(x));
      LINES.push([x, cableY(x), z, x, y0, z]);
    }
    for (const tx of [T1, T2]) for (let k = 1; k <= 14; k++) for (const s of [-1, 1]) {
      const x = tx + s * k * 9;
      LINES.push([tx + s * 9, 78, z, x, bridgeY(x) - 2.8, z]);
    }
  }
}
const bridgeGroup = new THREE.Group();

// ---------- Far away: DUMBO, downtown Brooklyn, Cobble Hill, Manhattan, the harbour ----------
function farAway(rnd) {
  const far = (r, y0, y1, m, tw = 3, th = 4) => bx(r, y0, y1, m.isMaterial ? { mat: m, top: FLAT_ROOF, tw, th } : rgb(m, FLAT));
  // the ground beyond the map
  for (const [x0, x1, z0, z1, y] of [[-130, 3000, -4000, BOUNDS.z0, 6], [BOUNDS.x1, 4000, BOUNDS.z0, 4000, TOP], [-110, BOUNDS.x1, BOUNDS.z1, 4000, TOP],
    [-6000, -830, -6000, 520, 2.2], [-6000, -1350, 520, 1150, 2.2], [-1250, -480, 1150, 1950, 3]]) {
    bx({ x0, x1, z0, z1 }, 0, y, rgb(x0 === -1250 ? '#5f8a46' : '#8f8b84', FLAT));
  }
  // DUMBO's warehouses, and the Clock Tower building at the foot of Main St
  for (let x = -120; x < 800; x += 30 + rnd() * 25) {
    for (let z = -860; z > -1500; z -= 40 + rnd() * 30) {
      if (Math.abs(z + 1650) < 40) continue;
      const w = 22 + rnd() * 20, d = 25 + rnd() * 15;
      far({ x0: x, x1: x + w, z0: z - d, z1: z }, 6, 6 + 14 + rnd() * 30, rnd() < 0.8 ? FAR_WAREHOUSE : FAR_TILES[2], 3, 3.8);
    }
  }
  far({ x0: -100, x1: -55, z0: -1010, z1: -960 }, 6, 66, FAR_WAREHOUSE, 3, 3.8);
  far({ x0: -84, x1: -71, z0: -991, z1: -978 }, 66, 82, '#a68a6e');
  shape(CONE4, '#5a6b6a', -77.5, 86, -984.5, 0, [9, 8, 9], FLAT);
  // downtown Brooklyn's towers, the Brooklyn Tower tallest of them
  for (let k = 0; k < 70; k++) {
    const x = 840 + rnd() * 700, z = -700 + rnd() * 1400, w = 20 + rnd() * 25;
    far({ x0: x, x1: x + w, z0: z, z1: z + w }, TOP, TOP + 25 + rnd() * rnd() * 170, FAR_TILES[Math.floor(rnd() * 4)]);
  }
  shape(new THREE.CylinderGeometry(14, 22, 325, 6), '#3e3733', 1180, TOP + 162, 720, 0, 1, FLAT);
  // Cobble Hill's low rows south of Atlantic
  for (let x = 0; x < 820; x += 95) for (let z = 600; z < 1400; z += 85) {
    far({ x0: x + 10, x1: x + 85, z0: z + 8, z1: z + 75 }, TOP, TOP + 11 + rnd() * 5, BROWN[Math.floor(rnd() * 3)], 2.1, 3.3);
  }
  // Lower Manhattan across the river, thickest round the Financial District
  for (let k = 0; k < 480; k++) {
    const x = -880 - rnd() * 1500, z = -1500 + rnd() * 2100;
    if (z > 520 && x > -1350) continue;
    const fidi = Math.max(0, 1 - Math.hypot(x + 1550, z - 100) / 800);
    const w = 18 + rnd() * 30, h = 25 + rnd() * 55 + fidi * (60 + rnd() * 220);
    far({ x0: x, x1: x + w, z0: z, z1: z + w * (0.8 + rnd() * 0.6) }, 2.2, 2.2 + h, FAR_TILES[Math.floor(rnd() * 4)]);
  }
  // One World Trade Center, the Woolworth Building, 8 Spruce St
  const glass = new THREE.MeshStandardMaterial({ color: '#9db5cc', metalness: 0.5, roughness: 0.25, flatShading: true });
  glass.userData.cast = false;
  shape(new THREE.CylinderGeometry(14, 30, 417, 4, 1).rotateY(Math.PI / 4), '#ffffff', -1950, 2.2 + 208.5, -150, 0, 1, glass);
  far({ x0: -1951, x1: -1949, z0: -151, z1: -149 }, 419, 541, '#d8d8d8');
  far({ x0: -1430, x1: -1395, z0: -480, z1: -440 }, 2.2, 120, FAR_TILES[3]);
  far({ x0: -1422, x1: -1403, z0: -470, z1: -450 }, 120, 200, '#d8d0bc');
  shape(CONE4, '#5f8f7a', -1412.5, 225, -460, 0, [12, 50, 12], FLAT);
  far({ x0: -1180, x1: -1150, z0: -560, z1: -520 }, 2.2, 265, '#b9bec3');
  // Governors Island, and Liberty in the harbour
  for (let k = 0; k < 30; k++) shape(new THREE.IcosahedronGeometry(1, 0), '#4f7a35', -1200 + rnd() * 700, 6, 1200 + rnd() * 700, 0, 6 + rnd() * 4, FLAT);
  bx({ x0: -2440, x1: -2360, z0: 3360, z1: 3440 }, 0, 8, rgb('#8f8b84', FLAT));
  bx({ x0: -2415, x1: -2385, z0: 3385, z1: 3415 }, 8, 34, rgb('#c8bfae', FLAT));
  shape(CYL8, '#6fa596', -2400, 50, 3400, 0, [5, 32, 5], FLAT);
  shape(CONE8, '#6fa596', -2400, 70, 3400, 0, [3.5, 8, 3.5], FLAT);
  bx({ x0: -2397, x1: -2394, z0: 3398, z1: 3401 }, 60, 80, rgb('#6fa596', FLAT));
  bx({ x0: -2398, x1: -2393, z0: 3397, z1: 3402 }, 80, 84, rgb('#d8b45a', FLAT));
  // the Manhattan Bridge upriver: blue steel towers
  const blue = '#6f8fa8', MZ = -1650;
  for (const tx of [-280, -760]) {
    bx({ x0: tx - 4, x1: tx + 4, z0: MZ - 18, z1: MZ + 18 }, 0, 12, rgb('#9a958c', FLAT));
    for (const z of [MZ - 14, MZ + 14]) bx({ x0: tx - 2.5, x1: tx + 2.5, z0: z - 2.5, z1: z + 2.5 }, 12, 104, rgb(blue, FLAT));
    for (const y of [50, 80, 100]) bx({ x0: tx - 1.5, x1: tx + 1.5, z0: MZ - 14, z1: MZ + 14 }, y, y + 3, rgb(blue, FLAT));
  }
  B.box(-1100, 600, 40, 44, MZ - 15, MZ + 15, rgb('#5b6f80', FLAT));
  for (const z of [MZ - 14, MZ + 14]) {
    const pts = [];
    for (let x = -1100; x <= 600; x += 25) {
      const y = x < -760 ? 104 - (x + 760) / -340 * 50 : x > -280 ? 104 - (x + 280) / 880 * 56 : 46 + 58 * Math.pow((x + 520) / 240, 2);
      pts.push(new THREE.Vector3(x, y, z));
    }
    bridgeGroup.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 80, 0.6, 5), new THREE.MeshStandardMaterial({ color: blue })));
  }
}
const FLAT_ROOF = ROOF.clone(); FLAT_ROOF.userData.cast = false;
const FAR_WAREHOUSE = WAREHOUSE.clone(); FAR_WAREHOUSE.userData = { cast: false };

// ---------- Build it all ----------
export const props = {};     // the instanced meshes, for heights.js to look at
export function buildHeights(parent) {
  const rnd = seeded(1898);
  plateau();
  for (const c of CELLS) buildCell(c, seeded(Math.round(c.x0 * 131 + c.z0 * 17 + 7)));
  signs();
  plots();
  civic(rnd);
  bluff(rnd);
  waterfront(rnd);
  brooklynBridge();
  farAway(seeded(77));
  // the boundary: you can't walk off the edge of the drawing
  solid(BOUNDS.x1, BOUNDS.x1 + 5, BOUNDS.z0 - 5, BOUNDS.z1 + 5, 99);
  solid(BLUFF - 1, BOUNDS.x1 + 5, BOUNDS.z0 - 5, BOUNDS.z0, 99);
  solid(-120, BOUNDS.x1 + 5, BOUNDS.z1, BOUNDS.z1 + 5, 99);
  B.finish(parent);
  parent.add(bridgeGroup);

  const water = new THREE.Mesh(new THREE.PlaneGeometry(14000, 14000).rotateX(-Math.PI / 2),
    new THREE.MeshStandardMaterial({ color: '#2f5f7f', roughness: 0.28, metalness: 0.25 }));
  water.position.set(-1500, 0.5, 0);
  water.receiveShadow = true;
  parent.add(water);
  const lines = new THREE.BufferGeometry();
  lines.setAttribute('position', new THREE.Float32BufferAttribute(LINES.flat(), 3));
  parent.add(new THREE.LineSegments(lines, new THREE.LineBasicMaterial({ color: '#55585c' })));

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
  props.carGeo = template(t => {
    t.box(-2.2, 2.2, 0.35, 1.0, -0.88, 0.88, rgb('#ffffff'));
    t.box(-1.25, 1.0, 1.0, 1.5, -0.8, 0.8, rgb('#3a4450'));
    t.box(-1.2, 0.95, 1.5, 1.56, -0.78, 0.78, rgb('#ffffff'));
    for (const dx of [-1.4, 1.4]) for (const dz of [-0.8, 0.8]) t.box(dx - 0.34, dx + 0.34, 0, 0.68, dz - 0.14, dz + 0.14, rgb('#151515'));
    for (const dz of [-0.6, 0.6]) {
      t.box(2.2, 2.23, 0.7, 0.85, dz - 0.15, dz + 0.15, rgb('#fff3c8'));
      t.box(-2.23, -2.2, 0.7, 0.85, dz - 0.15, dz + 0.15, rgb('#b02222'));
    }
  });
  props.carMat = colorMat();
  props.parked = instanced(props.carGeo, props.carMat, parked.map(({ box, ...p }) => p));
  const hydrantGeo = template(t => {
    t.box(-0.13, 0.13, 0, 0.5, -0.13, 0.13, rgb('#c8302c'));
    t.box(-0.21, 0.21, 0.28, 0.38, -0.06, 0.06, rgb('#c8302c'));
    t.box(-0.09, 0.09, 0.5, 0.62, -0.09, 0.09, rgb('#8f1f1c'));
  });
  props.hydrants = instanced(hydrantGeo, colorMat(), hydrants);
  for (const k of ['canopies', 'trunks', 'lamps', 'lanterns', 'parked', 'hydrants']) parent.add(props[k]);
}
