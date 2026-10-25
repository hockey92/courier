// Brownstone row houses: painted facades, stoops, railings, cornices and iron fences.
import * as THREE from 'three';
import { seeded } from './config.js';
import { addBox, limb, mat, roofMat } from './materials.js';

// ---------- Brownstones ----------
// The row of houses sits back from the sidewalk, leaving room for the stoops and iron fences.
export const FACADE_Z = -6.6, FENCE_Z = FACADE_Z + 1.45;
export const FRONT_ROW_SHIFT = 1.0; // the row across the street is mirrored, then nudged back to clear the front sidewalk

export const BROWNSTONE = [['#6e4535', '#563628', '#8a604c'], ['#7c4b36', '#623b2b', '#99684f'], ['#5b3b30', '#472e25', '#76554a']]; // stone, shadow, trim
export const BAYS = [1.15, 3.0, 4.85];   // window/door bays across a 6 m wide house, in metres from the left
export const brownstoneMats = new Map();

// Facade texture for a whole house (6 m x 7.6 m at 40 px a metre): rusticated garden level, a tall
// parlor floor with the front door at the top of the stoop, a bedroom floor above, lintels and sills.
export function brownstoneMaterial(stoneIdx, doorLeft, litSeed) {
  const key = `${stoneIdx}|${doorLeft}|${litSeed}`;
  if (brownstoneMats.has(key)) return brownstoneMats.get(key);
  const [stone, shadow, trim] = BROWNSTONE[stoneIdx];
  const M = 40, W = 6 * M, H = 7.6 * M, Y = m => H - m * M;
  const rnd = seeded(litSeed * 31 + stoneIdx * 7 + (doorLeft ? 3 : 0));
  const lit = Array.from({ length: 12 }, () => rnd() < 0.4);
  const doorBay = doorLeft ? 0 : 2;
  const speckle = seeded(stoneIdx + 5);

  const paint = emissive => {
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const g = c.getContext('2d');
    g.fillStyle = emissive ? '#000' : stone; g.fillRect(0, 0, W, H);
    if (!emissive) {
      for (let k = 0; k < 900; k++) {
        g.fillStyle = speckle() < 0.5 ? shadow : trim;
        g.globalAlpha = 0.25; g.fillRect(speckle() * W, speckle() * H, 2, 2);
      }
      g.globalAlpha = 1;
      g.fillStyle = shadow;
      for (let m = 0.5; m < 7.0; m += 0.5) g.fillRect(0, Y(m), W, 1);                      // stone courses
      g.fillRect(0, Y(1.6), W, 1.6 * M);                                                     // rusticated garden level
      g.fillStyle = stone;
      for (let m = 0.4; m < 1.6; m += 0.4) g.fillRect(0, Y(m) + 2, W, 0.4 * M - 4);
      g.fillStyle = trim;
      g.fillRect(0, Y(1.75), W, 0.15 * M);                                                   // water table
      g.fillRect(0, Y(7.25), W, 0.25 * M);                                                   // frieze under the cornice
    }
    let n = 0;
    const win = (cx, bottom, top, w) => {
      const x0 = (cx - w / 2) * M, x1 = (cx + w / 2) * M, y0 = Y(top), y1 = Y(bottom);
      const on = lit[n++ % lit.length];
      if (emissive) { if (on) { g.fillStyle = '#ffd88a'; g.fillRect(x0 + 4, y0 + 4, x1 - x0 - 8, y1 - y0 - 8); } return; }
      g.fillStyle = trim;
      g.fillRect(x0 - 6, y0 - 12, x1 - x0 + 12, 10);                                         // lintel
      g.fillRect(x0 - 8, y0 - 15, x1 - x0 + 16, 3);
      g.fillRect(x0 - 4, y1, x1 - x0 + 8, 5);                                                // sill
      g.fillStyle = '#e9e1cf'; g.fillRect(x0, y0, x1 - x0, y1 - y0);                         // cream frame
      g.fillStyle = on ? '#ffd88a' : '#2b2838'; g.fillRect(x0 + 4, y0 + 4, x1 - x0 - 8, y1 - y0 - 8);
      g.fillStyle = '#e9e1cf';
      g.fillRect((x0 + x1) / 2 - 1.5, y0, 3, y1 - y0);                                       // mullion
      g.fillRect(x0, (y0 + y1) / 2 - 1.5, x1 - x0, 3);                                       // sash
    };
    BAYS.forEach((cx, b) => {
      if (b === doorBay) {
        // front door with an arched transom, up at parlor level
        const x0 = (cx - 0.6) * M, x1 = (cx + 0.6) * M;
        if (emissive) {
          if (lit[11]) { g.fillStyle = '#ffd88a'; g.fillRect(x0 + 8, Y(4.4), x1 - x0 - 16, 0.35 * M); }
        } else {
          g.fillStyle = trim; g.fillRect(x0 - 8, Y(4.6), x1 - x0 + 16, 3.0 * M);
          g.fillStyle = lit[11] ? '#ffd88a' : '#2b2838'; g.fillRect(x0 + 8, Y(4.4), x1 - x0 - 16, 0.35 * M);
          g.fillStyle = '#3b2418'; g.fillRect(x0, Y(4.0), x1 - x0, 2.4 * M);
          g.fillStyle = '#2a190f';
          g.fillRect((x0 + x1) / 2 - 1, Y(4.0), 2, 2.4 * M);
          for (const px of [x0 + 6, (x0 + x1) / 2 + 5]) for (const py of [Y(3.8), Y(2.7)]) g.fillRect(px, py, 0.4 * M, 0.8 * M);
          g.fillStyle = '#c9a43a'; g.fillRect((x0 + x1) / 2 + 5, Y(2.6), 4, 4);               // brass knob
        }
      } else {
        win(cx, 0.3, 1.25, 0.9);   // garden level
        win(cx, 2.0, 4.2, 1.0);    // tall parlor windows
      }
      win(cx, 5.0, 6.7, 1.0);
    });
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  };
  const m = new THREE.MeshStandardMaterial({
    map: paint(false), emissiveMap: paint(true), emissive: 0xffffff, emissiveIntensity: 0.9, roughness: 0.95,
  });
  brownstoneMats.set(key, m);
  return m;
}

export const fenceMat = (() => {
  const c = document.createElement('canvas'); c.width = 64; c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#141414';
  g.fillRect(0, 10, 64, 5); g.fillRect(0, 112, 64, 5);                                        // rails
  for (const x of [14, 46]) {
    g.fillRect(x - 2, 4, 4, 124);                                                            // pickets
    g.beginPath(); g.moveTo(x - 5, 6); g.lineTo(x, -4); g.lineTo(x + 5, 6); g.fill();        // spear tips
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = THREE.RepeatWrapping;
  return new THREE.MeshStandardMaterial({ map: t, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.6 });
})();

export function fence(group, disposables, x0, x1) {
  if (x1 - x0 < 0.2) return;
  const geo = new THREE.PlaneGeometry(x1 - x0, 1.0);
  const uv = geo.attributes.uv;
  for (let v = 0; v < uv.count; v++) uv.setX(v, uv.getX(v) * (x1 - x0) / 0.5);
  disposables.push(geo);
  const m = new THREE.Mesh(geo, fenceMat);
  m.position.set((x0 + x1) / 2, 0.5, FENCE_Z);
  group.add(m);
}

export function addBrownstone(g, disposables, b) {
  const [stone, , trim] = BROWNSTONE[b.stone].map(c => mat(c));
  const x0 = b.x - b.w / 2, fz = FACADE_Z;
  const house = new THREE.Mesh(new THREE.BoxGeometry(b.w, b.h, b.d),
    [stone, stone, roofMat, roofMat, brownstoneMaterial(b.stone, b.doorLeft, b.lit), stone]);
  house.position.set(b.x, b.h / 2, fz - b.d / 2);
  house.receiveShadow = true;
  g.add(house); disposables.push(house.geometry);

  // cornice with brackets
  const dark = mat('#2e2622');
  addBox(g, b.w + 0.1, 0.45, 0.55, dark, b.x, b.h - 0.25, fz + 0.27, false);
  addBox(g, b.w + 0.14, 0.08, 0.6, dark, b.x, b.h, fz + 0.3, false);
  const brackets = Math.max(2, Math.round(b.w / 1.2));
  for (let k = 0; k < brackets; k++) addBox(g, 0.12, 0.4, 0.4, dark, x0 + 0.25 + k * (b.w - 0.5) / (brackets - 1), b.h - 0.65, fz + 0.2, false);

  // stoop up to the parlor floor door, with iron railings
  const sx = x0 + BAYS[b.doorLeft ? 0 : 2] * b.w / 6, sw = 1.6;
  for (let k = 0; k < 6; k++) {
    const front = fz + 1.6 - k * 0.2, top = 0.267 * (k + 1);
    addBox(g, sw, top, front - fz, stone, sx, top / 2, (front + fz) / 2, false);
  }
  addBox(g, 1.5, 0.12, 0.3, trim, sx, 4.55, fz + 0.15, false);                              // door hood
  const iron = mat('#141414');
  for (const s of [-1, 1]) {
    const rx = sx + s * (sw / 2 - 0.05);
    limb(g, [rx, 0.95, fz + 1.55], [rx, 2.55, fz + 0.4], 0.05, iron);                          // handrail
    addBox(g, 0.1, 1.05, 0.1, iron, rx, 0.525, fz + 1.55, false);                              // newel post
    for (let k = 1; k < 4; k++) {
      const z = fz + 1.55 - k * 0.29, base = 0.267 * Math.min(6, k * 1.45 + 0.5);
      addBox(g, 0.025, 0.85, 0.025, iron, rx, base + 0.425, z, false);                         // balusters
    }
  }
  fence(g, disposables, x0, sx - sw / 2);
  fence(g, disposables, sx + sw / 2, x0 + b.w);
}
