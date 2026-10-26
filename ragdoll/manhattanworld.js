// Lower Manhattan in 3D, Canal St down to the Battery, built from manhattanmap.js: the real streets and parks,
// made-up buildings filling the blocks (walk-ups, lofts, prewar offices, glass towers, each with its shopfronts,
// cornice, fire escapes or water tank), the landmarks where they really stand, the Brooklyn Bridge, the street
// furniture; and the collision for all of it.
// The map is a 2 m grid: every cell is road, sidewalk, a building lot, a park, a plaza or the river. The ground
// and the buildings are boxes merged out of runs of cells; the streets' details follow the streets' own lines.
import * as THREE from 'three';
import { BODY_R, seeded } from './config.js';
import { Batch, colorMat, instanced } from './batch.js';
import {
  APT, AWNINGS, BRICK, BROWN, CAR_COLORS, FLAT, GLASS, GOTHIC_BROWN, GREENS, LIME, MARBLE, PAINT, PLAIN, ROOF,
  SHOPS, TAN, WAREHOUSE, buildProps, facade, rgb, shade, signMat, tile,
} from './streetkit.js';
import { PARKS, POOLS, SPOTS, STREETS } from './manhattanmap.js';

export const C = 2;              // the grid's cell, in metres
export const WALK = 3.5;         // sidewalk width, curb to building line
export const CURB = 0.15;        // sidewalks (and everything off the road) stand this far above it
const WATER = -2.5;              // the rivers' level, down below the seawall
export const TILT = 29 * Math.PI / 180;   // the grid's turn from true north; the minimap turns by it
const RAY = 80;                  // how far (in cells) a block looks for the streets round it
const STEP = 0.25;               // the tallest ledge anyone walks straight up onto

// ---------- Collision ----------
// The game's { x0, x1, z0, z1, top } boxes, filed in a 16 m grid, plus the moving ones; the ground itself (the
// roads, and the curb up to everything else) comes from the grid, and the bridge deck is worked out
const GRID = 16, grid = new Map();
export const boxes = [];
export const movers = [];        // the traffic's and the driven cars' boxes, moved every step
let stamp = 0;
export function solid(x0, x1, z0, z1, top) {
  const b = { x0, x1, z0, z1, top, q: 0 };
  boxes.push(b);
  for (let i = Math.floor(x0 / GRID); i <= Math.floor(x1 / GRID); i++) {
    for (let j = Math.floor(z0 / GRID); j <= Math.floor(z1 / GRID); j++) {
      const k = i * 4096 + j;
      if (!grid.has(k)) grid.set(k, []);
      grid.get(k).push(b);
    }
  }
  return b;
}
const around = (x, z, r, top) => solid(x - r, x + r, z - r, z + r, top);
export function boxesNear(x, range, z = 0) {
  const out = [], q = ++stamp;
  for (let i = Math.floor((x - range) / GRID); i <= Math.floor((x + range) / GRID); i++) {
    for (let j = Math.floor((z - range) / GRID); j <= Math.floor((z + range) / GRID); j++) {
      for (const b of grid.get(i * 4096 + j) || []) {
        if (b.q !== q && b.x1 > x - range && b.x0 < x + range && b.z1 > z - range && b.z0 < z + range) { b.q = q; out.push(b); }
      }
    }
  }
  for (const b of movers) if (b.x1 > x - range && b.x0 < x + range && b.z1 > z - range && b.z0 < z + range) out.push(b);
  return out;
}
// top of whatever is under a body at (x, z) with its feet at y
export function floorAt(x, z, y) {
  const r = BODY_R * 0.7;
  let floor = 0;
  for (const [px, pz] of [[x - r, z - r], [x + r, z - r], [x - r, z + r], [x + r, z + r]]) {
    const g = groundAt(px, pz);
    if (g <= y + STEP && g > floor) floor = g;
  }
  for (const b of boxesNear(x, r, z)) {
    if (x + r > b.x0 && x - r < b.x1 && z + r > b.z0 && z - r < b.z1 && b.top <= y + STEP && b.top > floor) floor = b.top;
  }
  const [a, l] = bridgeLocal(x, z);
  if (onDeck(a, l)) { const d = deckY(a); if (d <= y + STEP && d > floor) floor = d; }
  return floor;
}
// is (x, y, z) inside something solid (or under the ground)?
export function inSolid(x, y, z) {
  if (y < groundAt(x, z) - 0.05) return true;
  return boxesNear(x, 0.01, z).some(b => x > b.x0 && x < b.x1 && z > b.z0 && z < b.z1 && y < b.top);
}
export const WORLD = { boxesNear, floorAt, inSolid, zMin: -1e5, zMax: 1e5, step: STEP };

// ---------- The grid: roads and sidewalks from the streets ----------
let X0 = Infinity, X1 = -Infinity, Z0 = Infinity, Z1 = -Infinity;
for (const [, , p] of STREETS) {
  for (let k = 0; k < p.length; k += 2) {
    X0 = Math.min(X0, p[k]); X1 = Math.max(X1, p[k]); Z0 = Math.min(Z0, p[k + 1]); Z1 = Math.max(Z1, p[k + 1]);
  }
}
X0 -= 100; X1 += 100; Z0 -= 100; Z1 += 100;
export const AREA = { x0: X0, x1: X1, z0: Z0, z1: Z1 };
const NX = Math.ceil((X1 - X0) / C), NZ = Math.ceil((Z1 - Z0) / C), N = NX * NZ;
export function cellAt(x, z) {
  const i = Math.floor((x - X0) / C), j = Math.floor((z - Z0) / C);
  return i < 0 || j < 0 || i >= NX || j >= NZ ? -1 : j * NX + i;
}
const cx = c => X0 + (c % NX + 0.5) * C, cz = c => Z0 + (Math.floor(c / NX) + 0.5) * C;
const kind = new Uint8Array(N);                 // 0 off the street, 1 sidewalk, 2 road
const edge = new Float32Array(N).fill(1e9);     // how far from the nearest street's curb (negative: on it)
export const owner = new Int16Array(N).fill(-1);  // that street (an index into STREETS)
function scanSegment(ax, az, bx, bz, reach, fn) {
  const dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz || 1;
  const i0 = Math.max(0, Math.floor((Math.min(ax, bx) - reach - X0) / C)), i1 = Math.min(NX - 1, Math.floor((Math.max(ax, bx) + reach - X0) / C));
  const j0 = Math.max(0, Math.floor((Math.min(az, bz) - reach - Z0) / C)), j1 = Math.min(NZ - 1, Math.floor((Math.max(az, bz) + reach - Z0) / C));
  for (let j = j0; j <= j1; j++) {
    for (let i = i0; i <= i1; i++) {
      const x = X0 + (i + 0.5) * C, z = Z0 + (j + 0.5) * C;
      const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / l2));
      fn(j * NX + i, Math.hypot(x - ax - t * dx, z - az - t * dz));
    }
  }
}
STREETS.forEach(([, w, p], s) => {
  const r = w / 2;
  for (let k = 0; k + 3 < p.length; k += 2) {
    scanSegment(p[k], p[k + 1], p[k + 2], p[k + 3], r + WALK, (c, dist) => {
      const d = dist - r;
      if (d > WALK) return;
      if (d < edge[c]) { edge[c] = d; owner[c] = s; }
      kind[c] = Math.max(kind[c], d <= 0 ? 2 : 1);
    });
  }
});

// the parks (OpenStreetMap's outlines) and the memorial's pools
function inPoly(p, x, z) {
  let inside = false;
  for (let i = 0, j = p.length - 2; i < p.length; j = i, i += 2) {
    if ((p[i + 1] > z) !== (p[j + 1] > z) && x < (p[j] - p[i]) * (z - p[i + 1]) / (p[j + 1] - p[i + 1]) + p[i]) inside = !inside;
  }
  return inside;
}
function rasterPoly(p, fn) {
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (let k = 0; k < p.length; k += 2) { x0 = Math.min(x0, p[k]); x1 = Math.max(x1, p[k]); z0 = Math.min(z0, p[k + 1]); z1 = Math.max(z1, p[k + 1]); }
  for (let z = Z0 + (Math.floor((z0 - Z0) / C) + 0.5) * C; z < z1; z += C) {
    for (let x = X0 + (Math.floor((x0 - X0) / C) + 0.5) * C; x < x1; x += C) {
      const c = cellAt(x, z);
      if (c >= 0 && inPoly(p, x, z)) fn(c, x, z);
    }
  }
}
export const parkOf = new Int16Array(N).fill(-1);    // an index into PARKS
PARKS.forEach(([, p], k) => rasterPoly(p, c => { if (!kind[c]) parkOf[c] = k; }));

// a block is a cell with streets on all four sides (within RAY)
const sides = new Uint8Array(N);
for (let j = 0; j < NZ; j++) {
  for (const [from, to, by] of [[0, NX, 1], [NX - 1, -1, -1]]) {
    let last = -1e9;
    for (let i = from; i !== to; i += by) { if (kind[j * NX + i]) last = i; if (Math.abs(i - last) <= RAY) sides[j * NX + i]++; }
  }
}
for (let i = 0; i < NX; i++) {
  for (const [from, to, by] of [[0, NZ, 1], [NZ - 1, -1, -1]]) {
    let last = -1e9;
    for (let j = from; j !== to; j += by) { if (kind[j * NX + i]) last = j; if (Math.abs(j - last) <= RAY) sides[j * NX + i]++; }
  }
}
// the river is what's left (not a street, a block or a park) that reaches the edge of the map
const river = new Uint8Array(N);
function flood(start, ok, mark) {
  const queue = new Int32Array(N);
  let head = 0, tail = 0;
  const go = c => { if (ok(c)) { mark(c); queue[tail++] = c; } };
  for (const c of start) go(c);
  while (head < tail) {
    const c = queue[head++], i = c % NX;
    if (i > 0) go(c - 1);
    if (i < NX - 1) go(c + 1);
    if (c >= NX) go(c - NX);
    if (c < N - NX) go(c + NX);
  }
}
{
  const border = [];
  for (let i = 0; i < NX; i++) border.push(i, (NZ - 1) * NX + i);
  for (let j = 0; j < NZ; j++) border.push(j * NX, j * NX + NX - 1);
  flood(border, c => !river[c] && !kind[c] && sides[c] < 4 && parkOf[c] < 0, c => { river[c] = 1; });
}
export const onLand = (x, z) => { const c = cellAt(x, z); return c >= 0 && !river[c]; };

// ---------- The Brooklyn Bridge's line ----------
// from Park Row out over the East River, along the real bridge (OpenStreetMap's), in its own frame: a along it
// towards Brooklyn, l across it. The deck climbs to 41 m by the shore, as in heights.js; walking into the
// Manhattan tower takes him across to Brooklyn Heights (manhattan.js)
export const BR = { x: 261, z: -702, deck: 41, half: 13 };
{
  const dx = 674 - BR.x, dz = -572 - BR.z, l = Math.hypot(dx, dz);
  BR.ux = dx / l; BR.uz = dz / l;
  let a = 0;
  while (a < 2000 && onLand(BR.x + BR.ux * a, BR.z + BR.uz * a)) a += C;
  BR.level = a - 10;              // the climb ends about at the shore
  BR.tower = a + 50;              // the Manhattan tower, out in the river
  BR.end = BR.tower - 9;          // where the deck meets the tower
  BR.anchor = BR.level - 60;      // the anchorage the cables come down to
  BR.heading = Math.atan2(BR.uz, BR.ux);   // the way to Brooklyn
}
export const bridgeLocal = (x, z) => { const dx = x - BR.x, dz = z - BR.z; return [dx * BR.ux + dz * BR.uz, -dx * BR.uz + dz * BR.ux]; };
export const bridgeAt = (a, l, y) => [BR.x + BR.ux * a - BR.uz * l, y, BR.z + BR.uz * a + BR.ux * l];
export const deckY = a => BR.deck * Math.max(0, Math.min(1, a / BR.level));
export const onDeck = (a, l) => a >= 0 && a <= BR.end && Math.abs(l) <= BR.half;

// ---------- Lots: the blocks cut up round jittered points, each a building with its own style ----------
const rnd = seeded(1625);
const pick = a => a[Math.floor(rnd() * a.length)];
const TERRA = tile(facade({ wall: '#e6dcc4', frame: '#d2c6aa', glass: '#3a4450', pair: true, lintel: '#d8cdb3' }), '#cfc3a8');
const CAST_IRON = ['#e4e0d6', '#c9c2b2', '#9aa3a8'].map(c => tile(facade({ wall: c, frame: shade(c, 8), wide: true, lintel: shade(c, -12), sill: shade(c, -12) }), '#8d877c'));
const STYLES = {
  walkup: { tiles: [...BRICK, ...BROWN, ...PAINT], fl: 3.3, bay: 2.1, cornice: ['#2e2622', '#e6e0d2'], shop: 0.75, tank: 0.5, escape: 0.55 },
  loft: { tiles: [WAREHOUSE, ...CAST_IRON, APT[1]], fl: 3.9, bay: 3, cornice: ['#6a3b2c', '#d9d3c4'], shop: 0.8, tank: 0.45, escape: 0.3 },
  midrise: { tiles: APT, fl: 3.2, bay: 2.2, cornice: ['#c9bfae'], shop: 0.45, tank: 0.5, canopy: true },
  prewar: { tiles: [LIME, TAN, APT[2], TERRA], fl: 3.6, bay: 2.2, cornice: ['#cfc7b4'], shop: 0.35, canopy: true, setback: true },
  glass: { tiles: [GLASS], fl: 3.8, bay: 1.5, shop: 0.2, setback: true },
};
const LOT = 24, LX = Math.ceil((X1 - X0) / LOT) + 1, LZ = Math.ceil((Z1 - Z0) / LOT) + 1;
export const lots = [];
for (let b = 0; b < LZ; b++) {
  for (let a = 0; a < LX; a++) {
    const x = X0 + (a + 0.15 + rnd() * 0.7) * LOT, z = Z0 + (b + 0.15 + rnd() * 0.7) * LOT;
    // the Financial District (from Chambers St south) is towers; Tribeca (north of Chambers) lofts and walk-ups
    const fidi = Math.max(0, Math.min(1, (z + 500) / 500)), tribeca = z < -900, r = rnd();
    let style, floors;
    if (rnd() < 0.05 + 0.3 * fidi) {
      style = rnd() < 0.55 ? 'glass' : 'prewar';
      floors = style === 'glass' ? 22 + Math.floor(rnd() ** 2 * (30 + 40 * fidi)) : 14 + Math.floor(rnd() * (16 + 20 * fidi));
    } else if (tribeca) {
      style = r < 0.6 ? 'loft' : r < 0.85 ? 'walkup' : 'midrise';
    } else {
      style = r < 0.4 ? 'walkup' : r < 0.7 ? 'midrise' : 'loft';
    }
    if (!floors) floors = style === 'walkup' ? 4 + Math.floor(rnd() * 3) : style === 'loft' ? 5 + Math.floor(rnd() * 6) : 8 + Math.floor(rnd() * 9);
    const st = STYLES[style];
    lots.push({
      x, z, style, st, floors, tile: pick(st.tiles), shop: rnd() < st.shop, tank: rnd() < (st.tank || 0),
      escape: rnd() < (st.escape || 0), cornice: st.cornice ? pick(st.cornice) : null,
    });
  }
}
export const lotOf = new Int32Array(N).fill(-1);
for (let c = 0; c < N; c++) {
  if (kind[c] || sides[c] < 4 || parkOf[c] >= 0 || river[c]) continue;
  const x = cx(c), z = cz(c), a = Math.floor((x - X0) / LOT), b = Math.floor((z - Z0) / LOT);
  let best = -1, bd = Infinity;
  for (let db = -1; db <= 1; db++) {
    for (let da = -1; da <= 1; da++) {
      if (a + da < 0 || a + da >= LX) continue;
      const k = (b + db) * LX + a + da, L = lots[k];
      if (!L) continue;
      const d = (L.x - x) ** 2 + (L.z - z) ** 2;
      if (d < bd) { bd = d; best = k; }
    }
  }
  lotOf[c] = best;
}

// ---------- What every cell is ----------
export const G = { RIVER: 0, ROAD: 1, WALK: 2, LOT: 3, PARK: 4, PLAZA: 5, YARD: 6, POOL: 7 };
export const ground = new Uint8Array(N);
for (let c = 0; c < N; c++) {
  ground[c] = river[c] ? G.RIVER : kind[c] === 2 ? G.ROAD : kind[c] === 1 ? G.WALK : parkOf[c] >= 0 ? G.PARK : lotOf[c] >= 0 ? G.LOT : G.PLAZA;
}
// the memorial's pools, as rects
const POOL_RECTS = POOLS.map(([, p]) => {
  const xs = p.filter((_, i) => i % 2 === 0), zs = p.filter((_, i) => i % 2 === 1);
  return { x0: Math.min(...xs), x1: Math.max(...xs), z0: Math.min(...zs), z1: Math.max(...zs) };
});
export function groundAt(x, z) {
  const c = cellAt(x, z);
  return c < 0 ? 0 : ground[c] === G.ROAD ? 0 : ground[c] === G.RIVER ? WATER : CURB;
}
// a landmark takes over the cells it stands on (and a plaza or yard round it)
export const claimOf = new Int16Array(N).fill(-1);  // an index into CLAIMS
export const CLAIMS = [];
function claim(name, x0, x1, z0, z1, as = G.PLAZA) {
  const k = CLAIMS.push(name) - 1;
  for (let z = z0 + C / 2; z < z1; z += C) {
    for (let x = x0 + C / 2; x < x1; x += C) {
      const c = cellAt(x, z);
      if (c < 0 || kind[c] || river[c]) continue;
      lotOf[c] = -1; claimOf[c] = k;
      if (ground[c] !== G.PARK) ground[c] = as;
    }
  }
}
// a whole block (everything off the street reachable from x, z)
function claimBlock(name, x, z, as) {
  const k = CLAIMS.push(name) - 1, start = cellAt(x, z);
  flood([start], c => !kind[c] && !river[c] && claimOf[c] !== k, c => { claimOf[c] = k; lotOf[c] = -1; ground[c] = as; });
}
// the biggest rect round (x, z), up to w by d, that's clear of the streets
function fit(x, z, w, d) {
  const r = { x0: x - w / 2, x1: x + w / 2, z0: z - d / 2, z1: z + d / 2 };
  const clear = (x0, x1, z0, z1) => {
    for (let zz = z0 + C / 2; zz < z1; zz += C) for (let xx = x0 + C / 2; xx < x1; xx += C) {
      const c = cellAt(xx, zz);
      if (c < 0 || kind[c] || river[c]) return false;
    }
    return true;
  };
  for (let k = 0; k < 40; k++) {
    let moved = false;
    if (!clear(r.x0, r.x0 + C, r.z0, r.z1)) { r.x0 += C; moved = true; }
    if (!clear(r.x1 - C, r.x1, r.z0, r.z1)) { r.x1 -= C; moved = true; }
    if (!clear(r.x0, r.x1, r.z0, r.z0 + C)) { r.z0 += C; moved = true; }
    if (!clear(r.x0, r.x1, r.z1 - C, r.z1)) { r.z1 -= C; moved = true; }
    if (!moved) break;
  }
  return r;
}

const WTC = { x: -455, z: -442, half: 30.5 };
const LANDMARKS = {
  wtc: fit(WTC.x, WTC.z, 61, 61),
  trinity: fit(SPOTS['Trinity Church'][0], SPOTS['Trinity Church'][1], 46, 26),
  federal: fit(SPOTS['Federal Hall'][0], SPOTS['Federal Hall'][1], 28, 40),
  nyse: fit(SPOTS['New York Stock Exchange'][0], SPOTS['New York Stock Exchange'][1], 42, 48),
  cityHall: fit(SPOTS['City Hall'][0], SPOTS['City Hall'][1], 66, 32),
  woolworth: fit(SPOTS['Woolworth Building'][0], SPOTS['Woolworth Building'][1], 46, 60),
  stPauls: fit(SPOTS["St. Paul's Chapel"][0], SPOTS["St. Paul's Chapel"][1], 38, 22),
  oculus: fit(-215, -366, 110, 40),
};
claimBlock('the 9/11 Memorial', -376, -300, G.PLAZA);
for (const P of POOL_RECTS) {
  for (let z = P.z0 + C / 2; z < P.z1; z += C) for (let x = P.x0 + C / 2; x < P.x1; x += C) { const c = cellAt(x, z); if (c >= 0 && !kind[c]) ground[c] = G.POOL; }
}
claimBlock('Trinity Church', ...SPOTS['Trinity Church'], G.YARD);
claimBlock("St. Paul's Chapel", ...SPOTS["St. Paul's Chapel"], G.YARD);
for (const [name, r] of [['One World Trade Center', LANDMARKS.wtc], ['Federal Hall', LANDMARKS.federal], ['the New York Stock Exchange', LANDMARKS.nyse],
  ['City Hall', LANDMARKS.cityHall], ['the Woolworth Building', LANDMARKS.woolworth], ['the Oculus', LANDMARKS.oculus]]) {
  claim(name, r.x0 - 2, r.x1 + 2, r.z0 - 2, r.z1 + 2);
}
{
  const [x, z] = SPOTS['Charging Bull'];
  claim('the Charging Bull', x - 9, x + 9, z - 9, z + 9);
}
// nothing's built under the bridge
for (let c = 0; c < N; c++) {
  const [a, l] = bridgeLocal(cx(c), cz(c));
  if (a > -6 && a < BR.tower + 30 && Math.abs(l) < 28 && lotOf[c] >= 0) { lotOf[c] = -1; ground[c] = G.PLAZA; }
}

// runs of cells with the same label in a row, merged with identical runs in the rows below, as rectangles
function rects(label, each) {
  let open = new Map();
  for (let j = 0; j <= NZ; j++) {
    const next = new Map();
    for (let i = 0; j < NZ && i < NX;) {
      const v = label(j * NX + i);
      let e = i + 1;
      while (e < NX && label(j * NX + e) === v) e++;
      if (v !== null) {
        const key = `${i},${e},${v}`, r = open.get(key) || { i0: i, i1: e, j0: j, v };
        r.j1 = j + 1;
        open.delete(key);
        next.set(key, r);
      }
      i = e;
    }
    for (const r of open.values()) each(X0 + r.i0 * C, X0 + r.i1 * C, Z0 + r.j0 * C, Z0 + r.j1 * C, r.v);
    open = next;
  }
}

// ---------- The streets as a network: each street (wide enough for cars) a way, joined at its ends ----------
export const ways = [];
STREETS.forEach(([name, w, p]) => {
  if (w < 8) return;
  const len = [0];
  for (let k = 2; k < p.length; k += 2) len.push(len[len.length - 1] + Math.hypot(p[k] - p[k - 2], p[k + 1] - p[k - 1]));
  ways.push({ name, w, p, len, total: len[len.length - 1], links: [[], []] });
});
for (const a of ways) {
  for (const e of [0, 1]) {
    const ax = e ? a.p[a.p.length - 2] : a.p[0], az = e ? a.p[a.p.length - 1] : a.p[1];
    for (const b of ways) {
      if (b === a) continue;
      if (Math.hypot(b.p[0] - ax, b.p[1] - az) < 3) a.links[e].push({ way: b, dir: 1 });
      if (Math.hypot(b.p[b.p.length - 2] - ax, b.p[b.p.length - 1] - az) < 3) a.links[e].push({ way: b, dir: -1 });
    }
  }
}
// the point s metres along a way: x, z, and the way's heading there
export function along(way, s, out = {}) {
  const { p, len } = way;
  let k = 1;
  while (k < len.length - 1 && len[k] < s) k++;
  const t = Math.max(0, Math.min(1, (s - len[k - 1]) / (len[k] - len[k - 1] || 1)));
  const ax = p[2 * k - 2], az = p[2 * k - 1], bx = p[2 * k], bz = p[2 * k + 1];
  out.x = ax + (bx - ax) * t; out.z = az + (bz - az) * t; out.h = Math.atan2(bz - az, bx - ax);
  return out;
}

// ---------- Helpers ----------
const B = new Batch();
const bx = (r, y0, y1, o) => B.box(r.x0, r.x1, y0, y1, r.z0, r.z1, o);
const M4 = new THREE.Matrix4(), Q = new THREE.Quaternion(), V = new THREE.Vector3(), S1 = new THREE.Vector3(1, 1, 1);
// any geometry, placed at (x, y, z), turned ry, scaled s (a number or [sx, sy, sz])
function shape(geo, color, x, y, z, ry = 0, s = 1, m = PLAIN) {
  Q.setFromAxisAngle(V.set(0, 1, 0), ry);
  const sc = Array.isArray(s) ? new THREE.Vector3(...s) : S1.clone().multiplyScalar(s);
  B.geometry(m, geo, M4.compose(new THREE.Vector3(x, y, z), Q, sc), color);
}
const BOX = new THREE.BoxGeometry(1, 1, 1), CYL = new THREE.CylinderGeometry(1, 1, 1, 10), CYL8 = new THREE.CylinderGeometry(1, 1, 1, 8);
const CONE4 = new THREE.ConeGeometry(1, 1, 4).rotateY(Math.PI / 4), CONE8 = new THREE.ConeGeometry(1, 1, 8);
const DOME = new THREE.SphereGeometry(1, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2);
const cyl = (color, x, y0, y1, z, r, m) => shape(CYL, color, x, (y0 + y1) / 2, z, 0, [r, y1 - y0, r], m);
// a box w long by d deep, centred on (x, z), turned to heading h (w runs along the heading)
const turned = (color, x, y0, y1, z, h, w, d, m) => shape(BOX, color, x, (y0 + y1) / 2, z, -h, [w, y1 - y0, d], m);
const lines = colorMat({ polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
lines.userData.cast = false;
// a flat strip on the road from (ax, az) to (bx, bz), w wide, offset sideways by off
function strip(ax, az, bx, bz, w, off, color, y = 0.012) {
  const l = Math.hypot(bx - ax, bz - az) || 1, nx = -(bz - az) / l, nz = (bx - ax) / l;
  const p0 = off - w / 2, p1 = off + w / 2;
  B.facing(lines, [[ax + nx * p0, y, az + nz * p0], [bx + nx * p0, y, bz + nz * p0], [bx + nx * p1, y, bz + nz * p1], [ax + nx * p1, y, az + nz * p1]], [ax, -1, az], null, color);
}

// the instanced props, gathered as things are built
const trees = [], lamps = [], lanterns = [], hydrants = [], tanks = [], graves = [];
export const parked = [];
function tree(x, y, z, s = 1, blocks = true) {
  trees.push({ x, y, z, s, ry: (x * 7 + z * 13) % 6.28, color: GREENS[Math.abs(Math.round(x * 3 + z)) % GREENS.length] });
  if (blocks) around(x, z, 0.22 * s, y + 3 * s);
}

// ---------- The ground ----------
// (the sidewalks' cells sit at road level: the sidewalks you see are the smooth slabs along the streets, below)
const GROUND = { [G.ROAD]: ['#4a4c50', 0], [G.WALK]: ['#b4b0a8', 0], [G.LOT]: ['#a9a59d', CURB], [G.PARK]: ['#6a9448', CURB],
  [G.PLAZA]: ['#c9c3b6', CURB], [G.YARD]: ['#647f45', CURB] };
const SIDEWALK = new THREE.Color('#b4b0a8'), CURB_FACE = new THREE.Color('#8d8a85'), ASPHALT = new THREE.Color('#4a4c50');
// the streets drawn along their own lines, whatever angle they're at: the asphalt, and the sidewalk either side
// with its curb, up to wherever it runs into the road of another street
function streetSurfaces() {
  STREETS.forEach(([, w, p]) => {
    const r = w / 2, mid = r + WALK / 2;
    for (let k = 0; k + 3 < p.length; k += 2) {
      const ax = p[k], az = p[k + 1], bx2 = p[k + 2], bz = p[k + 3], l = Math.hypot(bx2 - ax, bz - az);
      if (l < 0.5) continue;
      const ux = (bx2 - ax) / l, uz = (bz - az) / l, nx = -uz, nz = ux;
      const at = (u, off, y) => [ax + ux * u + nx * off, y, az + uz * u + nz * off];
      B.facing(lines, [at(-r, -r, 0.008), at(l + r, -r, 0.008), at(l + r, r, 0.008), at(-r, r, 0.008)], [ax, -1, az], null, ASPHALT);
      for (const s of [1, -1]) {
        const slab = (u0, u1) => {
          const o0 = s * r, o1 = s * (r + WALK + 0.3), inner = at((u0 + u1) / 2, s * mid, 0);
          B.facing(FLAT, [at(u0, o0, CURB), at(u1, o0, CURB), at(u1, o1, CURB), at(u0, o1, CURB)], [inner[0], -1, inner[2]], null, SIDEWALK);
          B.facing(FLAT, [at(u0, o0, 0), at(u1, o0, 0), at(u1, o0, CURB), at(u0, o0, CURB)], inner, null, CURB_FACE);
        };
        let start = null;
        for (let u = 0; u <= l + 0.01; u += 1) {
          const q = at(Math.min(u, l), s * mid, 0), c = cellAt(q[0], q[2]);
          const ok = c >= 0 && kind[c] === 1 && !river[c];
          if (ok && start === null) start = u;
          if ((!ok || u + 1 > l + 0.01) && start !== null) { const end = ok ? l : u; if (end - start > 0.5) slab(start, end); start = null; }
        }
      }
    }
  });
}
function buildGround() {
  rects(c => ground[c] === G.RIVER || ground[c] === G.POOL ? null : ground[c], (x0, x1, z0, z1, v) => {
    const [color, top] = GROUND[v];
    B.box(x0 - 0.05, x1 + 0.05, WATER - 0.5, top, z0 - 0.05, z1 + 0.05, { mat: FLAT, color: shade(color, -10), topColor: color });
  });
  streetSurfaces();
  // the river: a wall he can't get over, with a railing along the edge of the land
  rects(c => ground[c] === G.RIVER ? 1 : null, (x0, x1, z0, z1) => solid(x0, x1, z0, z1, 4));
  for (let c = 0; c < N; c++) {
    if (ground[c] === G.RIVER) continue;
    const x = cx(c), z = cz(c);
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const o = cellAt(x + dx * C, z + dz * C);
      if (o < 0 || ground[o] !== G.RIVER) continue;
      const ex = x + dx * C * 0.45, ez = z + dz * C * 0.45, len = C / 2 + 0.04;
      B.box(dx ? ex - 0.04 : x - len, dx ? ex + 0.04 : x + len, CURB + 1.0, CURB + 1.08, dz ? ez - 0.04 : z - len, dz ? ez + 0.04 : z + len, rgb('#1d1e20'));
      B.box(ex - 0.03, ex + 0.03, CURB, CURB + 1.04, ez - 0.03, ez + 0.03, rgb('#1d1e20'));
    }
  }
}

// ---------- The buildings ----------
// which sides of a rect face a sidewalk, as runs: { side, u0, u1 } (u along the side)
function frontage(x0, x1, z0, z1) {
  const out = [];
  for (const side of ['n', 's', 'w', 'e']) {
    const alongX = side === 'n' || side === 's', a0 = alongX ? x0 : z0, a1 = alongX ? x1 : z1;
    let start = null;
    for (let u = a0 + C / 2; u < a1 + C; u += C) {
      const px = alongX ? u : side === 'w' ? x0 - C / 2 : x1 + C / 2, pz = alongX ? (side === 'n' ? z0 - C / 2 : z1 + C / 2) : u;
      const c = u < a1 ? cellAt(px, pz) : -1, front = c >= 0 && ground[c] === G.WALK;
      if (front && start === null) start = u - C / 2;
      if (!front && start !== null) { if (u - C / 2 - start >= 3) out.push({ side, u0: start, u1: u - C / 2 }); start = null; }
    }
  }
  return out;
}
// a rect out in front of a side of (x0, x1, z0, z1): u0…u1 along it, d0…d1 out from the wall
function outside({ side, x0, x1, z0, z1 }, u0, u1, d0, d1) {
  switch (side) {
    case 'n': return { x0: u0, x1: u1, z0: z0 - d1, z1: z0 - d0 };
    case 's': return { x0: u0, x1: u1, z0: z1 + d0, z1: z1 + d1 };
    case 'w': return { x0: x0 - d1, x1: x0 - d0, z0: u0, z1: u1 };
    default: return { x0: x1 + d0, x1: x1 + d1, z0: u0, z1: u1 };
  }
}
// a slanted awning (or anything with a profile) along a side: pts are [d out from the wall, y]
function profile(f, u0, u1, pts, color) {
  const perp = { n: d => f.z0 - d, s: d => f.z1 + d, w: d => f.x0 - d, e: d => f.x1 + d }[f.side];
  B.prism(PLAIN, f.side === 'n' || f.side === 's' ? 'x' : 'z', u0, u1, pts.map(([d, y]) => [perp(d), y]), color);
}
function building(x0, x1, z0, z1, L, lotRnd) {
  const st = L.st, fl = st.fl, tw = (x1 - x0) / Math.max(1, Math.round((x1 - x0) / st.bay));
  const twz = (z1 - z0) / Math.max(1, Math.round((z1 - z0) / st.bay));
  let y = CURB;
  const R = { x0, x1, z0, z1 };
  const top = L.tower ? CURB + L.podium : CURB + L.floors * fl;
  const wall = { mat: L.tile, top: ROOF, tw: Math.min(tw, twz) || st.bay, th: fl };
  if (L.shop) {
    bx(R, y, y + 4.2, { mat: SHOPS[(L.x * 7 + L.z * 3 & 0xffff) % SHOPS.length], tw: 3, th: 4.2 });
    y += 4.2;
  }
  bx(R, y, top, wall);
  solid(x0, x1, z0, z1, top);
  if (L.cornice) bx({ x0: x0 - 0.35, x1: x1 + 0.35, z0: z0 - 0.35, z1: z1 + 0.35 }, top - 0.7, top + 0.05, rgb(L.cornice));
  // the street fronts: awnings over the shops, a door (and a canopy) for the rest, fire escapes up the walk-ups
  for (const run of frontage(x0, x1, z0, z1)) {
    const f = { side: run.side, x0, x1, z0, z1 }, len = run.u1 - run.u0;
    if (L.shop) {
      for (let u = run.u0 + 0.4; u < run.u1 - 2; u += 6.5) {
        if (lotRnd() < 0.35) continue;
        profile(f, u, Math.min(u + 4.6, run.u1 - 0.4), [[0, CURB + 3.7], [1.5, CURB + 2.95], [1.5, CURB + 2.8], [0, CURB + 3.5]], AWNINGS[Math.floor(lotRnd() * AWNINGS.length)]);
      }
    } else if (len > 4) {
      const uc = (run.u0 + run.u1) / 2;
      bx(outside(f, uc - 1.2, uc + 1.2, 0, 0.08), CURB, CURB + 2.8, rgb(L.style === 'glass' ? '#2a3038' : '#3b2a20'));
      if (st.canopy && len > 8) {
        bx(outside(f, uc - 1.4, uc + 1.4, 0, 3.3), CURB + 2.95, CURB + 3.15, rgb('#24433a'));
        for (const u of [uc - 1.3, uc + 1.3]) bx(outside(f, u - 0.04, u + 0.04, 3.17, 3.25), CURB, CURB + 2.95, rgb('#b8a66a'));
      }
    }
    if (L.escape && len >= 6) {
      // a black iron fire escape: a balcony at every floor above the shops, a ladder down one end
      const u0 = run.u0 + Math.min(2, len / 4), u1 = Math.min(u0 + 3.6, run.u1 - 1);
      for (let yy = CURB + 4.2 + fl * 0.6; yy < top - 1.5; yy += fl) {
        bx(outside(f, u0, u1, 0, 0.95), yy, yy + 0.07, rgb('#1d1e20'));
        bx(outside(f, u0, u1, 0.9, 0.95), yy + 0.07, yy + 0.95, rgb('#26282b'));
      }
      bx(outside(f, u1 - 0.55, u1 - 0.45, 0.55, 0.65), CURB + 4.2, top - 1.5, rgb('#1d1e20'));
      bx(outside(f, u1 - 0.1, u1, 0.55, 0.65), CURB + 4.2, top - 1.5, rgb('#1d1e20'));
    }
  }
}
function buildBlocks() {
  // each lot's extent, for the towers to stand back on
  const extent = new Map();
  rects(c => lotOf[c] >= 0 ? lotOf[c] : null, (x0, x1, z0, z1, v) => {
    const b = extent.get(v) || { x0, x1, z0, z1 };
    extent.set(v, { x0: Math.min(b.x0, x0), x1: Math.max(b.x1, x1), z0: Math.min(b.z0, z0), z1: Math.max(b.z1, z1) });
  });
  const owns = (v, r) => {
    for (let z = r.z0 + C / 2; z < r.z1; z += C) for (let x = r.x0 + C / 2; x < r.x1; x += C) if (lotOf[cellAt(x, z)] !== v) return false;
    return true;
  };
  for (const [v, b] of extent) {
    const L = lots[v];
    if (!L.st.setback || L.floors < 16) continue;
    const ix = Math.round((b.x1 - b.x0) * 0.18 / C) * C, iz = Math.round((b.z1 - b.z0) * 0.18 / C) * C;
    const t = { x0: b.x0 + ix, x1: b.x1 - ix, z0: b.z0 + iz, z1: b.z1 - iz };
    if (t.x1 - t.x0 >= 12 && t.z1 - t.z0 >= 12 && owns(v, t)) { L.tower = t; L.podium = (5 + (v % 5) * 2) * L.st.fl; }
  }
  const seeds = new Map();
  rects(c => lotOf[c] >= 0 ? lotOf[c] : null, (x0, x1, z0, z1, v) => {
    const L = lots[v];
    if (!seeds.has(v)) seeds.set(v, seeded(v * 7919 + 13));
    building(x0, x1, z0, z1, L, seeds.get(v));
    // a wooden water tank up on the roof, on its iron legs
    const h = CURB + L.floors * L.st.fl;
    if (L.tank && !L.tower && !L.hasTank && L.x > x0 + 3 && L.x < x1 - 3 && L.z > z0 + 3 && L.z < z1 - 3) {
      L.hasTank = true;
      tanks.push({ x: L.x, y: h, z: L.z, s: 0.8 + (v % 5) * 0.1 });
    }
  });
  // the towers above their podiums, with a setback or two and the machinery on the roof
  for (const [v] of extent) {
    const L = lots[v], t = L.tower;
    if (!t) continue;
    const wall = { mat: L.tile, top: ROOF, tw: L.st.bay, th: L.st.fl }, h = CURB + L.floors * L.st.fl, p = CURB + L.podium;
    const split = L.style === 'prewar' && L.floors > 26 ? p + (h - p) * 0.7 : h;
    bx(t, p, split, wall);
    solid(t.x0, t.x1, t.z0, t.z1, split);
    if (split < h) {
      const t2 = { x0: t.x0 + 3, x1: t.x1 - 3, z0: t.z0 + 3, z1: t.z1 - 3 };
      bx(t2, split, h, wall);
      solid(t2.x0, t2.x1, t2.z0, t2.z1, h);
    }
    if (L.cornice) bx({ x0: t.x0 - 0.3, x1: t.x1 + 0.3, z0: t.z0 - 0.3, z1: t.z1 + 0.3 }, split - 0.8, split, rgb(L.cornice));
    const m = { x0: t.x0 + (t.x1 - t.x0) * 0.3, x1: t.x1 - (t.x1 - t.x0) * 0.3, z0: t.z0 + (t.z1 - t.z0) * 0.3, z1: t.z1 - (t.z1 - t.z0) * 0.3 };
    bx(m, h, h + 4 + (v % 3) * 2, rgb('#6f6a63'));
  }
}

// ---------- Along the streets: trees, lamps, hydrants, parked cars, lane lines, crosswalks, the signs ----------
function streetFurniture() {
  const frnd = seeded(404);
  const yellow = new THREE.Color('#e3b93c'), white = new THREE.Color('#e8e6df');
  const signed = new Set();
  for (const way of ways) {
    const { p, w, len } = way, r = w / 2, id = STREETS.findIndex(s => s[2] === p);
    for (let k = 0; k + 3 < p.length; k += 2) {
      const ax = p[k], az = p[k + 1], bx2 = p[k + 2], bz = p[k + 3], l = Math.hypot(bx2 - ax, bz - az);
      if (l < 1) continue;
      const ux = (bx2 - ax) / l, uz = (bz - az) / l, h = Math.atan2(uz, ux);
      const s0 = len[k / 2], s1 = s0 + l;
      // well clear of the corners
      const clear = s => s > 10 && s < way.total - 10;
      for (const side of [1, -1]) {
        const nx = -uz * side, nz = ux * side;
        const at = (u, off) => [ax + ux * u + nx * off, az + uz * u + nz * off];
        const mine = (x, z, g) => { const c = cellAt(x, z); return c >= 0 && ground[c] === g && owner[c] === id; };
        for (let u = 4 + frnd() * 6; u < l - 4; u += 9 + frnd() * 5) {
          if (!clear(s0 + u)) continue;
          const [x, z] = at(u, r + 0.9);
          if (mine(x, z, G.WALK) && frnd() < 0.8) tree(x, CURB, z, 0.8 + frnd() * 0.4);
        }
        for (let u = 12; u < l - 6; u += 34) {
          if (!clear(s0 + u)) continue;
          const [x, z] = at(u, r + 0.45);
          if (!mine(x, z, G.WALK)) continue;
          lamps.push({ x, y: CURB, z, ry: -Math.atan2(-nz, -nx) });
          around(x, z, 0.09, CURB + 7);
        }
        if (l > 30 && frnd() < 0.5) {
          const [x, z] = at(8, r + 0.6);
          if (mine(x, z, G.WALK)) { hydrants.push({ x, y: CURB, z }); around(x, z, 0.18, CURB + 0.7); }
        }
        // parked cars along the curb, on the wider streets (the traffic keeps to the middle of them)
        if (w >= 13) {
          for (let u = 6 + frnd() * 3; u < l - 6; u += 6.2 + frnd() * 1.6) {
            if (!clear(s0 + u) || frnd() < 0.2) continue;
            const [x, z] = at(u, r - 1.1);
            if (!mine(x, z, G.ROAD)) continue;
            const c = Math.abs(ux), s = Math.abs(uz), hx = c * 2.2 + s * 0.9, hz = s * 2.2 + c * 0.9;
            const box = solid(x - hx, x + hx, z - hz, z + hz, 1.5);
            parked.push({ x, y: 0, z, ry: -(side > 0 ? h : h + Math.PI), color: CAR_COLORS[Math.floor(frnd() * CAR_COLORS.length)], box });
          }
        }
      }
      // the double yellow line down the middle of the wider streets
      if (w >= 13) {
        const a0 = Math.max(0, 9 - s0), a1 = Math.min(l, way.total - 9 - s0);
        if (a1 - a0 > 1) for (const off of [-0.14, 0.14]) strip(ax + ux * a0, az + uz * a0, ax + ux * a1, az + uz * a1, 0.12, off, yellow);
      }
    }
    // crosswalks across the ends that meet other streets, and the green signs on the corner
    for (const e of [0, 1]) {
      if (way.links[e].length < 2) continue;
      const s = e ? way.total - 4.5 : 4.5, pt = along(way, s), ux = Math.cos(pt.h), uz = Math.sin(pt.h);
      for (let off = -r + 0.8; off < r - 0.5; off += 1.1) strip(pt.x - ux * 1.5, pt.z - uz * 1.5, pt.x + ux * 1.5, pt.z + uz * 1.5, 0.55, off, white, 0.013);
      const node = e ? [way.p[way.p.length - 2], way.p[way.p.length - 1]] : [way.p[0], way.p[1]];
      const key = `${Math.round(node[0] / 6)},${Math.round(node[1] / 6)}`;
      const other = way.links[e].find(k => k.way.name && k.way.name !== way.name);
      if (!other || !way.name || signed.has(key)) continue;
      const o = along(other.way, other.dir > 0 ? 3 : other.way.total - 3);
      const vx = Math.cos(o.h), vz = Math.sin(o.h);
      for (const [sa, sb] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
        const px = node[0] + (-uz * sa) * (r + 0.7) + (-vz * sb) * (other.way.w / 2 + 0.7);
        const pz = node[1] + (ux * sa) * (r + 0.7) + (vx * sb) * (other.way.w / 2 + 0.7);
        const c = cellAt(px, pz);
        if (c < 0 || ground[c] !== G.WALK) continue;
        signed.add(key);
        B.box(px - 0.06, px + 0.06, CURB, CURB + 3.6, pz - 0.06, pz + 0.06, rgb('#2c3a30'));
        around(px, pz, 0.08, CURB + 3.6);
        const plate = (name, hh, y) => {
          Q.setFromAxisAngle(V.set(0, 1, 0), -hh);
          const off = 0.74;
          B.geometry(signMat(name), BOX, M4.compose(new THREE.Vector3(px + Math.cos(hh) * off, y, pz + Math.sin(hh) * off), Q, new THREE.Vector3(1.32, 0.25, 0.04)));
        };
        plate(way.name, pt.h, CURB + 3.37);
        plate(other.way.name, o.h, CURB + 3.07);
        break;
      }
    }
  }
}

// ---------- The parks: lawns, trees, lanterns and benches ----------
function parks() {
  const prnd = seeded(66), [fx, fz] = SPOTS['Castle Clinton'];
  for (let c = 0; c < N; c++) {
    if (ground[c] !== G.PARK) continue;
    const x = cx(c), z = cz(c), r = prnd();
    if (Math.hypot(x - fx, z - fz) < 32) continue;   // the fort's parade ground, and round its walls
    if (r < 0.022) tree(x + (prnd() - 0.5) * 1.5, CURB, z + (prnd() - 0.5) * 1.5, 1 + prnd() * 0.5);
    else if (r < 0.0245) { lanterns.push({ x, y: CURB, z }); around(x, z, 0.12, CURB + 4); }
    else if (r < 0.027) {
      // a park bench
      const along = prnd() < 0.5, w = along ? [1.8, 0.5] : [0.5, 1.8];
      B.box(x - w[0] / 2, x + w[0] / 2, CURB + 0.42, CURB + 0.48, z - w[1] / 2, z + w[1] / 2, rgb('#6b4a2e'));
      B.box(x - w[0] / 2, x + w[0] / 2, CURB, CURB + 0.42, z - w[1] / 2 + (along ? 0.2 : 0), z + w[1] / 2 - (along ? 0.2 : 0), rgb('#2a2b2d'));
      solid(x - w[0] / 2, x + w[0] / 2, z - w[1] / 2, z + w[1] / 2, CURB + 0.48);
    }
  }
}

// ---------- Landmarks ----------
const STONE = '#cfc9bb';
// Trinity Church: a brownstone Gothic nave, its tower and spire on Broadway, the churchyard's graves round it
function trinity(rr) {
  const r = LANDMARKS.trinity, tower = { x0: r.x1 - 10, x1: r.x1, z0: (r.z0 + r.z1) / 2 - 5, z1: (r.z0 + r.z1) / 2 + 5 };
  const nave = { x0: r.x0, x1: tower.x0, z0: r.z0, z1: r.z1 }, mid = (nave.z0 + nave.z1) / 2, w = nave.z1 - nave.z0;
  bx(nave, CURB, CURB + 16, { mat: GOTHIC_BROWN, top: ROOF, tw: 5, th: 16 });
  B.prism(PLAIN, 'x', nave.x0, nave.x1, [[nave.z0 - 0.5, CURB + 16], [nave.z1 + 0.5, CURB + 16], [mid, CURB + 16 + w * 0.45]], '#4b4f55');
  solid(nave.x0, nave.x1, nave.z0, nave.z1, CURB + 16);
  bx(tower, CURB, CURB + 44, { mat: GOTHIC_BROWN, top: ROOF, tw: 5, th: 15 });
  solid(tower.x0, tower.x1, tower.z0, tower.z1, CURB + 44);
  for (const x of [tower.x0 + 0.7, tower.x1 - 0.7]) for (const z of [tower.z0 + 0.7, tower.z1 - 0.7]) shape(CONE4, '#5e3f32', x, CURB + 47, z, 0, [1, 6, 1]);
  shape(CONE4, '#5e3f32', (tower.x0 + tower.x1) / 2, CURB + 65, (tower.z0 + tower.z1) / 2, 0, [6.5, 42, 6.5]);
  graveyard('Trinity Church', rr);
}
function graveyard(name, rr) {
  const k = CLAIMS.indexOf(name);
  for (let c = 0; c < N; c++) {
    if (claimOf[c] !== k || ground[c] !== G.YARD) continue;
    const x = cx(c), z = cz(c), r = rr();
    if (r < 0.18 && !inSolid(x, 1, z)) graves.push({ x, y: CURB, z, ry: rr() * 0.3, s: 0.8 + rr() * 0.5 });
    else if (r < 0.21) tree(x, CURB, z, 1 + rr() * 0.4, false);
  }
}
// St. Paul's Chapel: Georgian brownstone, its steeple at the west end
function stPauls(rr) {
  const r = LANDMARKS.stPauls, mid = (r.z0 + r.z1) / 2, w = r.z1 - r.z0;
  bx(r, CURB, CURB + 13, { mat: BROWN[1], top: ROOF, tw: 4, th: 6.5 });
  B.prism(PLAIN, 'x', r.x0 + 6, r.x1, [[r.z0 - 0.4, CURB + 13], [r.z1 + 0.4, CURB + 13], [mid, CURB + 13 + w * 0.35]], '#55504a');
  solid(r.x0, r.x1, r.z0, r.z1, CURB + 13);
  const t = { x0: r.x0, x1: r.x0 + 6, z0: mid - 3, z1: mid + 3 };
  bx(t, CURB + 13, CURB + 24, rgb('#7a5040'));
  cyl('#e6e2d8', r.x0 + 3, CURB + 24, CURB + 32, mid, 2.4);
  shape(CONE8, '#d8d3c6', r.x0 + 3, CURB + 37, mid, 0, [2, 10, 2]);
  graveyard("St. Paul's Chapel", rr);
}
// a temple front on side 's' or 'e' of r: steps, columns, entablature and pediment
function portico(r, side, n, h, color = '#e6e2d8') {
  const alongX = side === 's' || side === 'n', u0 = alongX ? r.x0 : r.z0, u1 = alongX ? r.x1 : r.z1, depth = 6;
  const f = { side, ...r };
  bx(outside(f, u0, u1, 0, depth), CURB, CURB + 1.5, rgb(color));
  for (let k = 0; k < 5; k++) bx(outside(f, u0 + 1, u1 - 1, depth + k * 0.4, depth + (k + 1) * 0.4), CURB, CURB + 1.5 - (k + 1) * 0.28, rgb(color));
  const stepR = outside(f, u0, u1, 0, depth + 2);
  solid(stepR.x0, stepR.x1, stepR.z0, stepR.z1, CURB + 0.6);
  for (let k = 0; k < n; k++) {
    const u = u0 + 1.5 + k * (u1 - u0 - 3) / (n - 1), d = depth - 1.2;
    const [x, z] = alongX ? [u, side === 's' ? r.z1 + d : r.z0 - d] : [side === 'e' ? r.x1 + d : r.x0 - d, u];
    cyl('#f1eee6', x, CURB + 1.5, CURB + 1.5 + h, z, 0.75);
    around(x, z, 0.75, CURB + 1.5 + h);
  }
  bx(outside(f, u0, u1, 0, depth), CURB + 1.5 + h, CURB + 3.5 + h, rgb(color));
  const perp = { s: d => r.z1 + d, e: d => r.x1 + d }[side], top = CURB + 3.5 + h;
  B.prism(PLAIN, alongX ? 'z' : 'x', perp(0), perp(depth), alongX
    ? [[u0, top], [u1, top], [(u0 + u1) / 2, top + (u1 - u0) * 0.16]] : [[u0, top], [u1, top], [(u0 + u1) / 2, top + (u1 - u0) * 0.16]], shade(color, 3));
}
// Federal Hall: a marble Doric temple on Wall St, Washington on the steps
function federalHall() {
  const r = LANDMARKS.federal;
  bx(r, CURB, CURB + 20, { mat: MARBLE, top: ROOF, tw: 3.3, th: 10 });
  solid(r.x0, r.x1, r.z0, r.z1, CURB + 20);
  portico(r, 's', 8, 14.5);
  const x = (r.x0 + r.x1) / 2, z = r.z1 + 7.5;
  bx({ x0: x - 1.2, x1: x + 1.2, z0: z - 1.2, z1: z + 1.2 }, CURB, CURB + 3, rgb('#bdb6a6'));
  solid(x - 1.2, x + 1.2, z - 1.2, z + 1.2, CURB + 3);
  bx({ x0: x - 0.5, x1: x + 0.5, z0: z - 0.4, z1: z + 0.4 }, CURB + 3, CURB + 6, rgb('#3f5a4a'));
  bx({ x0: x - 0.3, x1: x + 0.3, z0: z - 0.3, z1: z + 0.3 }, CURB + 6, CURB + 6.7, rgb('#3f5a4a'));
}
// the New York Stock Exchange: six columns on Broad St, a pediment, and the flag between them
function nyse() {
  const r = LANDMARKS.nyse, h = 34;
  bx(r, CURB, CURB + h, { mat: LIME, top: ROOF, tw: 4.3, th: 3.6 });
  solid(r.x0, r.x1, r.z0, r.z1, CURB + h);
  portico({ ...r, z0: r.z0 + 4, z1: r.z1 - 4 }, 'e', 6, 18);
  const c = document.createElement('canvas'); c.width = 190; c.height = 100;
  const g = c.getContext('2d');
  for (let k = 0; k < 13; k++) { g.fillStyle = k % 2 ? '#ffffff' : '#b22234'; g.fillRect(0, k * 100 / 13, 190, 100 / 13 + 1); }
  g.fillStyle = '#3c3b6e'; g.fillRect(0, 0, 76, 54);
  g.fillStyle = '#fff';
  for (let a = 0; a < 9; a++) for (let b = 0; b < (a % 2 ? 5 : 6); b++) g.fillRect(4 + b * 12 + (a % 2) * 6, 3 + a * 5.6, 2.5, 2.5);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  const flag = new THREE.MeshStandardMaterial({ map: t, roughness: 0.8, side: THREE.DoubleSide });
  const zc = (r.z0 + r.z1) / 2, fw = r.z1 - r.z0 - 14;
  const plane = new THREE.PlaneGeometry(fw, fw * 100 / 190).rotateY(Math.PI / 2);
  B.geometry(flag, plane, new THREE.Matrix4().makeTranslation(r.x1 + 3.4, CURB + 3.5 + 18 - fw * 100 / 380 - 0.5, zc));
}
// City Hall: marble, a central block with its portico and cupola, a wing either side, the park round it
function cityHall() {
  const r = LANDMARKS.cityHall, xm = (r.x0 + r.x1) / 2, cw = 14;
  for (const wing of [{ ...r, x1: xm - cw }, { ...r, x0: xm + cw }]) {
    bx(wing, CURB, CURB + 15, { mat: MARBLE, top: ROOF, tw: 3.3, th: 5 });
    bx({ x0: wing.x0 - 0.4, x1: wing.x1 + 0.4, z0: wing.z0 - 0.4, z1: wing.z1 + 0.4 }, CURB + 14.4, CURB + 15.6, rgb('#ece8de'));
    solid(wing.x0, wing.x1, wing.z0, wing.z1, CURB + 15.6);
  }
  const mid = { ...r, x0: xm - cw, x1: xm + cw };
  bx(mid, CURB, CURB + 19, { mat: MARBLE, top: ROOF, tw: 3.3, th: 6 });
  solid(mid.x0, mid.x1, mid.z0, mid.z1, CURB + 19);
  portico({ ...mid, x0: xm - 9, x1: xm + 9 }, 's', 6, 11);
  const z = (r.z0 + r.z1) / 2;
  shape(CYL8, '#eeeae1', xm, CURB + 22.5, z, 0, [5, 7, 5]);
  shape(CYL8, '#e2ddd2', xm, CURB + 26.3, z, 0, [5.4, 0.6, 5.4]);
  shape(DOME, '#c9c3b8', xm, CURB + 26.6, z, 0, [4.4, 3.6, 4.4]);
  shape(CYL8, '#eeeae1', xm, CURB + 31, z, 0, [1.2, 2, 1.2]);
  bx({ x0: xm - 0.3, x1: xm + 0.3, z0: z - 0.3, z1: z + 0.3 }, CURB + 32, CURB + 34, rgb('#b89a4a'));
  // the fountain in the park in front
  const fz = r.z1 + 40;
  cyl('#cfc9bb', xm, CURB, CURB + 0.7, fz, 7);
  cyl('#6f9fb8', xm, CURB + 0.7, CURB + 0.72, fz, 6.4);
  cyl('#cfc9bb', xm, CURB, CURB + 2.6, fz, 0.8);
  around(xm, fz, 6.5, CURB + 0.7);
}
// the Woolworth Building: a cream Gothic slab, its tower on Broadway, the copper pyramid on top
function woolworth() {
  const r = LANDMARKS.woolworth, wall = { mat: TERRA, top: ROOF, tw: 2.2, th: 3.6 };
  bx(r, CURB, CURB + 105, wall);
  solid(r.x0, r.x1, r.z0, r.z1, CURB + 105);
  const zc = (r.z0 + r.z1) / 2, t = { x0: r.x1 - 26, x1: r.x1, z0: zc - 13, z1: zc + 13 };
  bx(t, CURB + 105, CURB + 190, wall);
  solid(t.x0, t.x1, t.z0, t.z1, CURB + 190);
  const t2 = { x0: t.x0 + 4, x1: t.x1 - 4, z0: t.z0 + 4, z1: t.z1 - 4 };
  bx(t2, CURB + 190, CURB + 212, wall);
  const xc = (t.x0 + t.x1) / 2;
  for (const x of [t.x0 + 1, t.x1 - 1]) for (const z of [t.z0 + 1, t.z1 - 1]) shape(CONE4, '#d9cfb6', x, CURB + 194, z, 0, [1.4, 8, 1.4]);
  shape(CONE4, '#5f8f7a', xc, CURB + 222, zc, 0, [13, 20, 13]);
  bx({ x0: xc - 1.5, x1: xc + 1.5, z0: zc - 1.5, z1: zc + 1.5 }, CURB + 230, CURB + 236, rgb('#d9cfb6'));
  shape(CONE4, '#5f8f7a', xc, CURB + 239, zc, 0, [1.8, 6, 1.8]);
  bx({ x0: r.x0 - 0.5, x1: r.x1 + 0.5, z0: r.z0 - 0.5, z1: r.z1 + 0.5 }, CURB + 104, CURB + 105.6, rgb('#d2c6aa'));
}
// One World Trade Center: a glass square that twists into a square turned 45°, 417 m up, the spire to 541 m
function oneWtc() {
  const r = LANDMARKS.wtc, x = (r.x0 + r.x1) / 2, z = (r.z0 + r.z1) / 2, half = Math.min(r.x1 - r.x0, r.z1 - r.z0) / 2;
  const glass = new THREE.MeshStandardMaterial({ color: '#a9c0d2', metalness: 0.55, roughness: 0.22, flatShading: true });
  bx({ x0: x - half, x1: x + half, z0: z - half, z1: z + half }, CURB, CURB + 57, { mat: GLASS, top: ROOF, tw: 1.5, th: 3.8 });
  const y0 = CURB + 57, y1 = CURB + 417, bot = [], topP = [];
  for (let k = 0; k < 4; k++) {
    const a = Math.PI / 4 + k * Math.PI / 2, b = k * Math.PI / 2;
    bot.push([x + Math.cos(a) * half * Math.SQRT2, y0, z + Math.sin(a) * half * Math.SQRT2]);
    topP.push([x + Math.cos(b) * half, y1, z + Math.sin(b) * half]);
  }
  const inside = [x, (y0 + y1) / 2, z];
  for (let k = 0; k < 4; k++) {
    const k1 = (k + 1) % 4;
    B.facing(glass, [bot[k], bot[k1], topP[k1]], inside);
    B.facing(glass, [topP[k], bot[k], topP[k1]], inside);
  }
  B.facing(PLAIN, topP, [x, 0, z], null, new THREE.Color('#d8dde2'));
  solid(x - half, x + half, z - half, z + half, y1);
  bx({ x0: x - 1, x1: x + 1, z0: z - 1, z1: z + 1 }, y1, CURB + 541, rgb('#d8dde2'));
}
// the 9/11 Memorial: two pools where the towers stood, the water falling into a void in the middle of each,
// the names round the edge, and rows of oaks across the plaza
function memorial(rr) {
  const water = new THREE.MeshStandardMaterial({ color: '#3d5a6e', roughness: 0.2, metalness: 0.3 });
  for (const P of POOL_RECTS) {
    const { x0, x1, z0, z1 } = P, e = 1.2, deep = WATER + 0.2;
    // the bronze parapets with the names
    for (const r of [{ ...P, z1: z0 + e }, { ...P, z0: z1 - e }, { ...P, x1: x0 + e, z0: z0 + e, z1: z1 - e }, { ...P, x0: x1 - e, z0: z0 + e, z1: z1 - e }]) {
      bx(r, WATER - 0.5, CURB + 1.0, { mat: PLAIN, color: '#3a332e', topColor: '#2a2522' });
      solid(r.x0, r.x1, r.z0, r.z1, CURB + 1.0);
    }
    // the falls down the inside walls into the pool, and the void in the middle it pours into
    const I = { x0: x0 + e, x1: x1 - e, z0: z0 + e, z1: z1 - e };
    for (const r of [{ ...I, z1: I.z0 + 0.3 }, { ...I, z0: I.z1 - 0.3 }, { ...I, x1: I.x0 + 0.3 }, { ...I, x0: I.x1 - 0.3 }]) bx(r, deep, CURB, rgb('#dfe7ec'));
    B.box(I.x0, I.x1, deep - 0.3, deep, I.z0, I.z1, { mat: water });
    const xc = (x0 + x1) / 2, zc = (z0 + z1) / 2, v = (x1 - x0) / 6;
    B.box(xc - v, xc + v, deep, deep + 0.02, zc - v, zc + v, rgb('#0d0f11'));
    solid(I.x0, I.x1, I.z0, I.z1, 30);
  }
  const k = CLAIMS.indexOf('the 9/11 Memorial');
  for (let c = 0; c < N; c++) {
    if (claimOf[c] !== k || ground[c] !== G.PLAZA) continue;
    const x = cx(c), z = cz(c);
    if (Math.round((x - X0) / C) % 5 || Math.round((z - Z0) / C) % 5) continue;
    if (POOL_RECTS.some(p => x > p.x0 - 8 && x < p.x1 + 8 && z > p.z0 - 8 && z < p.z1 + 8)) continue;
    if (!inSolid(x, 1, z) && rr() < 0.85) tree(x, CURB, z, 1 + rr() * 0.3);
  }
}
// the Oculus: the white ribs of the transit hub, spread like wings
function oculus() {
  const r = LANDMARKS.oculus, x = (r.x0 + r.x1) / 2, z = (r.z0 + r.z1) / 2, len = Math.min(r.x1 - r.x0, 100);
  bx({ x0: x - len * 0.4, x1: x + len * 0.4, z0: z - 7, z1: z + 7 }, CURB, CURB + 12, rgb('#f2f2ee'));
  solid(x - len * 0.4, x + len * 0.4, z - 7, z + 7, CURB + 12);
  const n = 26;
  for (let k = 0; k < n; k++) {
    const u = (k / (n - 1) - 0.5) * len * 0.9, t = Math.abs(u) / (len * 0.45), L = 18 + t * 30;
    for (const s of [-1, 1]) {
      const tilt = s * (0.45 + 0.25 * t);
      Q.setFromEuler(new THREE.Euler(tilt, 0, 0));
      const mx = x + u, my = CURB + 8 + Math.cos(tilt) * L / 2, mz = z + s * (6 + Math.sin(Math.abs(tilt)) * L / 2);
      B.geometry(PLAIN, BOX, M4.compose(new THREE.Vector3(mx, my, mz), Q, new THREE.Vector3(1.1, L, 1.3)), new THREE.Color('#f4f4f0'));
    }
  }
}
// Castle Clinton: the round sandstone fort in Battery Park
function castleClinton() {
  const [x, z] = SPOTS['Castle Clinton'], R = 28, n = 36;
  for (let k = 0; k < n; k++) {
    const a = (k + 0.5) / n * Math.PI * 2;
    if (Math.abs(Math.atan2(Math.sin(a - Math.PI * 1.75), Math.cos(a - Math.PI * 1.75))) < 0.12) continue;   // the gate
    const px = x + Math.cos(a) * R, pz = z + Math.sin(a) * R;
    turned('#b5785a', px, CURB, CURB + 9, pz, a + Math.PI / 2, 2 * Math.PI * R / n + 0.3, 2.4);
    around(px, pz, 1.4, CURB + 9);
  }
}
// the Charging Bull, head down, on the cobbles at the top of Bowling Green
function chargingBull() {
  const [x, z] = SPOTS['Charging Bull'], bronze = '#5a4632', h = -Math.PI / 2, k = 1.4;   // facing up Broadway
  const at = (u, l) => [x + Math.cos(h) * u * k - Math.sin(h) * l * k, z + Math.sin(h) * u * k + Math.cos(h) * l * k];
  const part = (u, l, y0, y1, w, d) => { const [px, pz] = at(u, l); turned(bronze, px, CURB + y0 * k, CURB + y1 * k, pz, h, w * k, d * k); };
  part(0, 0, 0.9, 2.2, 3.4, 1.5);           // the body
  part(0.9, 0, 1.6, 2.8, 1.4, 1.6);         // the hump of the shoulders
  part(2.0, 0, 0.9, 1.8, 1, 1.1);           // the head, down low
  for (const l of [-0.7, 0.7]) part(2.2, l, 1.7, 1.85, 0.25, 0.8);   // the horns
  for (const u of [-1.3, 1.2]) for (const l of [-0.5, 0.5]) part(u, l, 0, 1, 0.35, 0.35);
  part(-1.8, 0, 1.2, 2.4, 0.15, 0.15);      // the tail, up
  around(x, z, 2.3 * k, CURB + 2.4 * k);
}

// ---------- The Brooklyn Bridge ----------
// the deck (roadways either side of the boardwalk), piers up the approach, the anchorage, both granite towers and
// the four cables; the deck runs on past the Manhattan tower to the Brooklyn one
function brooklynBridge(parent) {
  const granite = '#b3a994', SPAN = 486;
  const rail = colorMat({ side: THREE.DoubleSide });
  const col = c => new THREE.Color(c);
  const flat = (a0, a1, l0, l1, dy) => [bridgeAt(a0, l0, deckY(a0) + dy), bridgeAt(a1, l0, deckY(a1) + dy), bridgeAt(a1, l1, deckY(a1) + dy), bridgeAt(a0, l1, deckY(a0) + dy)];
  const wall = (a0, a1, l, dy0, dy1) => [bridgeAt(a0, l, deckY(a0) + dy0), bridgeAt(a1, l, deckY(a1) + dy0), bridgeAt(a1, l, deckY(a1) + dy1), bridgeAt(a0, l, deckY(a0) + dy1)];
  const H = BR.half;
  for (const [a0, a1] of [[0, BR.level], [BR.level, BR.end], [BR.tower + 9, BR.tower + SPAN - 9]]) {
    const below = bridgeAt((a0 + a1) / 2, 0, deckY((a0 + a1) / 2) - 1), above = bridgeAt((a0 + a1) / 2, 0, deckY((a0 + a1) / 2) + 1);
    B.facing(PLAIN, flat(a0, a1, -3.5, 3.5, 0), below, null, col('#8a6d4c'));
    for (const [l0, l1] of [[-H, -3.5], [3.5, H]]) B.facing(PLAIN, flat(a0, a1, l0, l1, 0), below, null, col('#4e5055'));
    B.facing(PLAIN, flat(a0, a1, -H, H, -2.5), above, null, col('#5b5650'));
    for (const l of [-H, H]) {
      B.facing(PLAIN, wall(a0, a1, l, -2.5, 0), bridgeAt((a0 + a1) / 2, 0, deckY((a0 + a1) / 2) - 1), null, col('#5b5650'));
      B.poly(rail, wall(a0, a1, l, 0.9, 1.15), null, col('#3b3d40'));
    }
  }
  // a box in the bridge's frame, and its collision in 4 m slices along the bridge
  const rbox = (a0, a1, l0, l1, y0, y1, color) => {
    const [x, , z] = bridgeAt((a0 + a1) / 2, (l0 + l1) / 2, 0);
    turned(color, x, y0, y1, z, BR.heading, a1 - a0, l1 - l0);
  };
  const rsolid = (a0, a1, l0, l1, top) => {
    for (let a = a0; a < a1; a += 4) {
      const pts = [[a, l0], [a, l1], [Math.min(a + 4, a1), l0], [Math.min(a + 4, a1), l1]].map(([p, q]) => bridgeAt(p, q, 0));
      solid(Math.min(...pts.map(p => p[0])), Math.max(...pts.map(p => p[0])), Math.min(...pts.map(p => p[2])), Math.max(...pts.map(p => p[2])), top);
    }
  };
  for (let a = 60; a < BR.anchor - 30; a += 40) {
    for (const l of [-9, 9]) { rbox(a - 1.5, a + 1.5, l - 1.5, l + 1.5, 0, deckY(a) - 2.5, granite); rsolid(a - 1.5, a + 1.5, l - 1.5, l + 1.5, deckY(a) - 2.5); }
  }
  const anchorTop = deckY(BR.anchor) - 2.5;
  rbox(BR.anchor - 25, BR.anchor + 25, -18, 18, 0, anchorTop, granite);
  rsolid(BR.anchor - 25, BR.anchor + 25, -18, 18, anchorTop);
  // the towers, as in heights.js: three legs, two pointed arches between them
  const D = BR.deck;
  for (const t of [BR.tower, BR.tower + SPAN]) {
    rbox(t - 12, t + 12, -26, 26, WATER, D - 3, granite);
    for (const [l0, l1] of [[-22, -13], [-3, 3], [13, 22]]) rbox(t - 9, t + 9, l0, l1, D - 3, 84, granite);
    rbox(t - 9, t + 9, -22, 22, D + 31, 84, granite);
    for (const l of [-8, 8]) rbox(t - 9, t + 9, l - 5, l + 5, D + 22, D + 31, granite);
    rbox(t - 9.6, t + 9.6, -22.6, 22.6, 82.5, 84, '#a39a86');
  }
  // the cables: down from the tower to the anchorage, and sagging across the span; suspenders down to the deck
  const sag = (a0, y0, a1, y1, s) => a => { const k = (a - a0) / (a1 - a0); return y0 + (y1 - y0) * k - s * 4 * k * (1 - k); };
  const parts = [[BR.anchor, BR.tower, sag(BR.anchor, anchorTop + 2, BR.tower, 82, 8)], [BR.tower, BR.tower + SPAN, sag(BR.tower, 82, BR.tower + SPAN, 82, 82 - D - 2)]];
  const cableY = a => { for (const [a0, a1, f] of parts) if (a >= a0 && a <= a1) return f(a); return 0; };
  const cableMat = new THREE.MeshStandardMaterial({ color: '#4a4c50', roughness: 0.7 }), segs = [];
  for (const l of [-H, -3.6, 3.6, H]) {
    const pts = [];
    for (let a = BR.anchor; a <= BR.tower + SPAN; a += 10) pts.push(new THREE.Vector3(...bridgeAt(a, l, cableY(a))));
    const tube = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 200, 0.45, 6), cableMat);
    tube.castShadow = true;
    parent.add(tube);
    for (let a = BR.anchor + 5; a < BR.tower + SPAN - 10; a += 5) {
      if (Math.abs(a - BR.tower) < 10) continue;
      segs.push(...bridgeAt(a, l, cableY(a)), ...bridgeAt(a, l, deckY(a)));
    }
  }
  const lg = new THREE.BufferGeometry();
  lg.setAttribute('position', new THREE.Float32BufferAttribute(segs, 3));
  parent.add(new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ color: '#3a3c40' })));
}

// ---------- Build it all ----------
export const props = {};
export function buildManhattan(parent) {
  const rr = seeded(1776);
  buildGround();
  buildBlocks();
  streetFurniture();
  parks();
  trinity(rr); stPauls(rr); federalHall(); nyse(); cityHall(); woolworth(); oneWtc(); memorial(rr); oculus();
  castleClinton(); chargingBull();
  brooklynBridge(parent);
  B.finish(parent);
  const water = new THREE.Mesh(new THREE.PlaneGeometry(20000, 20000).rotateX(-Math.PI / 2),
    new THREE.MeshStandardMaterial({ color: '#2f5f7f', roughness: 0.28, metalness: 0.25 }));
  water.position.y = WATER;
  water.receiveShadow = true;
  parent.add(water);
  Object.assign(props, buildProps(parent, { trees, lamps, lanterns, hydrants, parked }));
  // the water tanks on their iron legs, and the churchyards' gravestones
  const t = new Batch(false), wood = colorMat();
  t.geometry(wood, new THREE.CylinderGeometry(1.6, 1.6, 2.6, 10), new THREE.Matrix4().makeTranslation(0, 2.9, 0), '#6a4a3a');
  t.geometry(wood, new THREE.ConeGeometry(1.75, 1.1, 10), new THREE.Matrix4().makeTranslation(0, 4.75, 0), '#5a3e30');
  for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) t.geometry(wood, new THREE.BoxGeometry(0.14, 1.6, 0.14), new THREE.Matrix4().makeTranslation(x, 0.8, z), '#1c1c1e');
  parent.add(instanced(t.merged(), wood, tanks));
  const g = new Batch(false), stone = colorMat();
  g.box(-0.3, 0.3, 0, 0.8, -0.08, 0.08, rgb('#8f8b84', stone));
  g.box(-0.2, 0.2, 0.8, 0.95, -0.08, 0.08, rgb('#8f8b84', stone));
  parent.add(instanced(g.merged(), stone, graves));
}

// ---------- Where he is ----------
export function placeName(x, z) {
  const c = cellAt(x, z);
  if (c < 0) return 'Lower Manhattan';
  if (claimOf[c] >= 0) return cap(CLAIMS[claimOf[c]]);
  if (parkOf[c] >= 0 && PARKS[parkOf[c]][0]) return PARKS[parkOf[c]][0];
  if (owner[c] >= 0 && STREETS[owner[c]][0]) return STREETS[owner[c]][0];
  return 'Lower Manhattan';
}
const cap = s => s[0].toUpperCase() + s.slice(1);
// out in the open (a street, a sidewalk, a park or a plaza), not inside a building's lot
export function outdoors(x, z) {
  const c = cellAt(x, z);
  return c >= 0 && ground[c] !== G.RIVER && ground[c] !== G.LOT;
}
// a clear spot near (x, z) at street level: [x, y, z], or null
export function spotNear(x, z) {
  for (let r = 0; r < 60; r += 1.5) {
    for (let a = 0; a < (r ? 16 : 1); a++) {
      const px = x + Math.cos(a / 16 * Math.PI * 2) * r, pz = z + Math.sin(a / 16 * Math.PI * 2) * r;
      if (!outdoors(px, pz)) continue;
      const y = floorAt(px, pz, CURB + 0.5);
      if (y > CURB + 0.1) continue;
      if (!inSolid(px, y + 1, pz) && !inSolid(px, y + 1.7, pz)) return [px, y, pz];
    }
  }
  return null;
}
// the sidewalks people walk along: [x0, z0, x1, z1] down the middle of each sidewalk beside a long enough piece of street
export function sidewalkPaths(rnd2) {
  const out = [];
  for (const way of ways) {
    const { p, w } = way, id = STREETS.findIndex(s => s[2] === p);
    for (let k = 0; k + 3 < p.length; k += 2) {
      const ax = p[k], az = p[k + 1], bx2 = p[k + 2], bz = p[k + 3], l = Math.hypot(bx2 - ax, bz - az);
      if (l < 30 || rnd2() > 0.45) continue;
      const ux = (bx2 - ax) / l, uz = (bz - az) / l, side = rnd2() < 0.5 ? 1 : -1, off = w / 2 + 1.75;
      const a = [ax + ux * 4 - uz * side * off, az + uz * 4 + ux * side * off], b = [bx2 - ux * 4 - uz * side * off, bz - uz * 4 + ux * side * off];
      const ok = q => { const c = cellAt(q[0], q[1]); return c >= 0 && ground[c] === G.WALK && owner[c] === id; };
      if (ok(a) && ok(b)) out.push([...a, ...b]);
    }
  }
  return out;
}

// ---------- The minimap's picture, in Google Maps' colours ----------
export function drawMiniMap() {
  const c = document.createElement('canvas');
  c.width = NX; c.height = NZ;
  const g = c.getContext('2d'), img = g.createImageData(NX, NZ);
  const COL = {
    [G.RIVER]: [163, 205, 241], [G.ROAD]: [255, 255, 255], [G.WALK]: [246, 244, 240], [G.LOT]: [222, 218, 210],
    [G.PARK]: [197, 230, 185], [G.PLAZA]: [230, 226, 218], [G.YARD]: [197, 230, 185], [G.POOL]: [120, 150, 175],
  };
  for (let k = 0; k < N; k++) {
    let col = COL[ground[k]];
    if (ground[k] === G.LOT && lots[lotOf[k]].floors > 20) col = [214, 209, 199];
    img.data.set([...col, 255], k * 4);
  }
  g.putImageData(img, 0, 0);
  const px = 1 / C, at = (x, z) => [(x - X0) * px, (z - Z0) * px];
  // the bridge, in the highways' yellow
  g.strokeStyle = '#f8d26a'; g.lineWidth = 26 * px;
  g.beginPath(); g.moveTo(...at(BR.x, BR.z)); g.lineTo(...at(...bridgeAt(BR.end, 0, 0).filter((_, i) => i !== 1))); g.stroke();
  // street names along the longer pieces of each street, not too close to the last one with that name
  g.fillStyle = '#5f6368'; g.font = '600 8px system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  const named = new Map();
  for (const [name, , p] of STREETS) {
    if (!name) continue;
    for (let k = 0; k + 3 < p.length; k += 2) {
      const l = Math.hypot(p[k + 2] - p[k], p[k + 3] - p[k + 1]);
      if (l < 90) continue;
      const mx = (p[k] + p[k + 2]) / 2, mz = (p[k + 1] + p[k + 3]) / 2;
      if ((named.get(name) || []).some(([x, z]) => Math.hypot(x - mx, z - mz) < 260)) continue;
      named.set(name, [...(named.get(name) || []), [mx, mz]]);
      let a = Math.atan2(p[k + 3] - p[k + 1], p[k + 2] - p[k]);
      if (a > Math.PI / 2) a -= Math.PI; else if (a < -Math.PI / 2) a += Math.PI;
      g.save(); g.translate(...at(mx, mz)); g.rotate(a); g.fillText(name, 0, 0); g.restore();
    }
  }
  // the parks' names, and the landmarks'
  g.fillStyle = '#3c7a36'; g.font = '600 8px system-ui, sans-serif';
  for (const [name, p] of PARKS) {
    if (!name || p.length < 16) continue;
    let sx = 0, sz = 0;
    for (let k = 0; k < p.length; k += 2) { sx += p[k]; sz += p[k + 1]; }
    g.fillText(name, ...at(sx / (p.length / 2), sz / (p.length / 2)));
  }
  g.fillStyle = '#8a5a2b'; g.font = '700 8px system-ui, sans-serif';
  for (const [name, [x, z]] of Object.entries(SPOTS)) if (!name.includes('&') && !PARKS.some(([n]) => n === name)) g.fillText(name, ...at(x, z));
  g.fillStyle = '#80868b'; g.font = '700 14px system-ui, sans-serif';
  g.fillText('FINANCIAL DISTRICT', ...at(80, 150)); g.fillText('TRIBECA', ...at(-420, -1150)); g.fillText('CIVIC CENTER', ...at(220, -820));
  g.fillStyle = '#3f7fb5'; g.font = 'italic 600 12px system-ui, sans-serif';
  g.fillText('Hudson River', ...at(-950, -600)); g.fillText('East River', ...at(800, -200));
  return { canvas: c, area: { x0: X0, z0: Z0 }, px, tilt: TILT };
}
