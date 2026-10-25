// Montague St by Borough Hall, Brooklyn, rebuilt from a Street View photo with the game's box helpers,
// with the game's ragdoll hero to walk it.
import * as THREE from 'three';
import { BODY_R, seeded } from './config.js';
import { camera, hemi, keyLight, renderer, scene, stars, sunsetRim } from './scene.js';
import { addBox, canvasTex, crateMat, cylGeo, limb, mat } from './materials.js';
import { Ragdoll } from './ragdoll.js';
import { SKINS, SKIN_ORDER } from './looks.js';
import { updateDust } from './effects.js';
import { cars as gameTraffic } from './traffic.js';
import { music } from './music.js';

// Same axes as the game: x runs down the street (the photo looks along +x), y is up, -z is the left side.
// Road z -4.5 … 4.5, left sidewalk to the facades at -10, right sidewalk to 9.

// the ragdoll brings the game's world with it: its loop of traffic doesn't belong here, and its music
// (which starts on the first click) stays off until M
for (const c of gameTraffic) scene.remove(c.g);
music.toggle();

// ---------- Collision, in the game's format ----------
// { x0, x1, z0, z1, top } boxes; anything up to STEP high (the curbs) he walks straight up onto
const boxes = [], STEP = 0.2;
function solid(x0, x1, z0, z1, top) { const b = { x0, x1, z0, z1, top }; boxes.push(b); return b; }
const around = (x, z, r, top) => solid(x - r, x + r, z - r, z + r, top);
function boxesNear(x, range) { return boxes.filter(b => b.x1 > x - range && b.x0 < x + range); }
function floorAt(x, z, y) {
  let floor = 0;
  const r = BODY_R * 0.7;
  for (const b of boxesNear(x, 4)) {
    if (x + r > b.x0 && x - r < b.x1 && z + r > b.z0 && z - r < b.z1 && b.top <= y + STEP && b.top > floor) floor = b.top;
  }
  return floor;
}
const MONTAGUE = { boxesNear, floorAt, zMin: -10.6, zMax: 49, step: STEP };

// ---------- Overcast daylight instead of the game's dusk ----------
{
  const c = document.createElement('canvas'); c.width = 2; c.height = 512;
  const g = c.getContext('2d');
  const gr = g.createLinearGradient(0, 0, 0, 512);
  gr.addColorStop(0, '#99a3ad'); gr.addColorStop(0.55, '#cfd4d8'); gr.addColorStop(1, '#eef0f0');
  g.fillStyle = gr; g.fillRect(0, 0, 2, 512);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  scene.background = t;
}
scene.fog = new THREE.Fog(0xd9dcde, 90, 520);
hemi.color.set(0xf4f6fa); hemi.groundColor.set(0x7a766f); hemi.intensity = 2.1;
keyLight.color.set(0xffffff); keyLight.intensity = 1.1;
keyLight.position.set(-15, 80, -35); keyLight.target.position.set(25, 0, 0);
Object.assign(keyLight.shadow.camera, { left: -50, right: 50, top: 50, bottom: -50, near: 1, far: 200 });
keyLight.shadow.camera.updateProjectionMatrix();
sunsetRim.intensity = 0;
stars.visible = false;
camera.far = 1000;

// ---------- Helpers ----------
// a box whose texture repeats every tw × th metres on every wall, so windows keep their size
function tiledGeo(w, h, d, tw, th) {
  const g = new THREE.BoxGeometry(w, h, d);
  const uv = g.attributes.uv;
  const size = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (let f = 0; f < 6; f++) for (let v = f * 4; v < f * 4 + 4; v++) uv.setXY(v, uv.getX(v) * size[f][0] / tw, uv.getY(v) * size[f][1] / th);
  return g;
}
const roofMat = mat('#8b8781');
function block(g, x0, x1, z0, z1, y0, y1, wall, tw, th, top = roofMat) {
  const m = new THREE.Mesh(tiledGeo(x1 - x0, y1 - y0, z1 - z0, tw, th), [wall, wall, top, top, wall, wall]);
  m.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
  m.receiveShadow = true;
  g.add(m);
  solid(x0, x1, z0, z1, y1);
  return m;
}
function wallMat(paint, extra = {}) {
  return new THREE.MeshStandardMaterial({ map: canvasTex(128, paint), roughness: 0.9, flatShading: true, ...extra });
}
function addCyl(g, r, h, material, x, y, z, rBottom = r) {
  const m = new THREE.Mesh(cylGeo(r, rBottom, h), material);
  m.position.set(x, y, z);
  m.castShadow = m.receiveShadow = true;
  g.add(m);
  return m;
}
// a sign texture of any shape (canvasTex only paints squares)
function signMat(w, h, paint) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  paint(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return new THREE.MeshStandardMaterial({ map: t, roughness: 0.6, flatShading: true });
}

// ---------- Facade tiles (one bay by one floor each) ----------
const LIMESTONE = wallMat((g, n) => {              // 4.3 × 3.6 m: two windows per bay between piers
  g.fillStyle = '#cfc7b4'; g.fillRect(0, 0, n, n);
  g.fillStyle = '#bdb4a0'; g.fillRect(0, 0, 8, n); g.fillRect(n - 8, 0, 8, n);
  g.fillStyle = '#c4bba7'; g.fillRect(0, 104, n, 12);
  for (const x of [20, 70]) {
    g.fillStyle = '#4c5056'; g.fillRect(x - 2, 20, 42, 86);
    g.fillStyle = '#30343a'; g.fillRect(x, 22, 38, 82);
    g.fillStyle = '#6a6f75'; g.fillRect(x + 18, 22, 2, 82); g.fillRect(x, 52, 38, 2);
  }
});
const BASE_GLASS = wallMat((g, n) => {             // 4.3 × 12 m: shopfront, a stone band, two tall floors
  g.fillStyle = '#272b31'; g.fillRect(0, 0, n, n);
  g.fillStyle = '#3a434d'; g.fillRect(14, 86, 100, 42);
  g.fillStyle = '#5d636a';
  for (const x of [14, 46, 80, 112]) g.fillRect(x, 86, 2, 42);
  for (const x of [14, 46, 80, 112]) g.fillRect(x, 8, 2, 66);
  for (const y of [8, 40, 74]) g.fillRect(14, y, 100, 2);
  g.fillStyle = '#b8af9b'; g.fillRect(0, 76, n, 9);
});
const STONE2 = wallMat((g, n) => {                 // 3 × 3.4 m
  g.fillStyle = '#a29581'; g.fillRect(0, 0, n, n);
  g.fillStyle = '#8f826f'; g.fillRect(0, 0, 10, n);
  g.fillStyle = '#34383d'; g.fillRect(30, 22, 70, 80);
  g.fillStyle = '#5b5f63'; g.fillRect(64, 22, 2, 80);
});
const DARK_GLASS = wallMat((g, n) => {             // 1.6 × 3.6 m
  g.fillStyle = '#23272d'; g.fillRect(0, 0, n, n);
  g.fillStyle = '#39414b'; g.fillRect(8, 10, 112, 92);
  g.fillStyle = '#48515c'; g.fillRect(8, 10, 112, 18);
}, { metalness: 0.3, roughness: 0.45 });
const BRICK = wallMat((g, n) => {                  // 2.4 × 3 m
  g.fillStyle = '#8a4a37'; g.fillRect(0, 0, n, n);
  g.fillStyle = '#7b4030';
  for (let y = 4; y < n; y += 8) g.fillRect(0, y, n, 2);
  g.fillStyle = '#d8d1c4'; g.fillRect(34, 24, 60, 74);
  g.fillStyle = '#2d2e33'; g.fillRect(38, 28, 52, 66);
});
const TAN = wallMat((g, n) => {                    // 2.6 × 3.1 m
  g.fillStyle = '#b8936e'; g.fillRect(0, 0, n, n);
  g.fillStyle = '#3a3b40'; g.fillRect(30, 26, 68, 70);
});
const WEWORK_GLASS = wallMat((g, n) => {           // 1.5 × 3.8 m curtain wall
  const gr = g.createLinearGradient(0, 0, n, n);
  gr.addColorStop(0, '#aebdca'); gr.addColorStop(1, '#8a9cad');
  g.fillStyle = gr; g.fillRect(0, 0, n, n);
  g.fillStyle = '#76889a'; g.fillRect(0, 100, n, 28);
  g.fillStyle = '#e2e6e9'; g.fillRect(0, 0, 5, n); g.fillRect(0, 98, n, 4);
}, { metalness: 0.35, roughness: 0.3 });
const FENCE = wallMat((g, n) => {                  // 2.44 × 2.6 m plywood panel, painted green
  g.fillStyle = '#2f5d46'; g.fillRect(0, 0, n, n);
  g.fillStyle = '#284f3c'; g.fillRect(0, 0, 4, n); g.fillRect(0, 62, n, 3);
});
const GREY = wallMat((g, n) => {                   // 2.5 × 3.2 m, the distant blocks
  g.fillStyle = '#9b958d'; g.fillRect(0, 0, n, n);
  g.fillStyle = '#4a4d52'; g.fillRect(28, 26, 72, 70);
});

const street = new THREE.Group();
scene.add(street);
const g = street;

// ---------- Ground ----------
const asphalt = mat('#5e6064'), walk = mat('#aba8a2'), curb = mat('#8d8a85'), joint = mat('#96938d');
addBox(g, 340, 0.2, 9, asphalt, 80, -0.1, 0, false);
addBox(g, 340, 0.3, 5.6, walk, 80, 0, -7.3, false);                      // left sidewalk, top at 0.15
addBox(g, 340, 0.3, 4.6, walk, 80, 0, 6.8, false);                       // right sidewalk
for (const z of [-4.55, 4.55]) addBox(g, 340, 0.32, 0.2, curb, 80, 0.005, z, false);
addBox(g, 70, 0.3, 40, mat('#b4b1ab'), -28, 0, 29, false);               // the plaza by Borough Hall
addBox(g, 7, 0.3, 40, mat('#b4b1ab'), 3.5, 0, 29, false);
addBox(g, 50, 0.1, 22, mat('#7c6e5c'), 32, 0.05, 20, false);             // dirt in the building site
addBox(g, 340, 0.2, 60, mat('#5e6064'), 80, -0.12, 40, false);
addBox(g, 340, 0.2, 60, mat('#5e6064'), 80, -0.12, -40, false);
for (let x = -30; x < 150; x += 1.6) {
  addBox(g, 0.04, 0.01, 5.5, joint, x, 0.152, -7.3, false);
  if (x > 7) addBox(g, 0.04, 0.01, 4.4, joint, x, 0.152, 6.8, false);
}
// cellar doors / tree pits on the left sidewalk, steel plates and a grate in the road
for (const x of [0.5, 8.5]) addBox(g, 2.2, 0.02, 1.1, mat('#4a3d33'), x, 0.16, -5.6, false);
addBox(g, 1.8, 0.02, 1.4, mat('#3f4044'), 4, 0.008, -0.8, false);
addBox(g, 1.1, 0.02, 0.7, mat('#2c2d31'), 5.5, 0.009, 1.4, false);
for (let k = 0; k < 6; k++) addBox(g, 0.04, 0.021, 0.6, mat('#55565b'), 5.05 + k * 0.18, 0.01, 1.4, false);
// the cross street at the far end, with its crosswalks
addBox(g, 16, 0.2, 120, asphalt, 152, -0.09, 0, false);
for (const x of [145.5, 158.5]) for (let z = -4; z < 4.2; z += 0.9) addBox(g, 2.4, 0.02, 0.45, mat('#e9e6dc'), x, 0.006, z, false);
solid(-90, 250, -10.1, -4.45, 0.15);   // left sidewalk
solid(-90, 250, 4.45, 9.1, 0.15);      // right sidewalk
solid(-63, 7, 9.1, 49, 0.15);          // plaza
solid(-64, -62, -80, 80, 99);          // the ends of the drawing
solid(240, 242, -80, 80, 99);

// ---------- Left side ----------
// The limestone block: giant columns over a dark glass base, rows of paired windows above
const FACADE = -10, BAY = 4.3, B1 = -17.2, B1_END = B1 + BAY * 14;
block(g, B1, B1_END, FACADE - 26, FACADE - 0.7, 0, 12, BASE_GLASS, BAY, 12);
block(g, B1, B1_END, FACADE - 26, FACADE, 14, 62, LIMESTONE, BAY, 3.6);
const lime = mat('#d3cbb8'), limeDark = mat('#bfb6a2'), granite = mat('#8e8a85');
addBox(g, B1_END - B1, 2.2, 1.4, lime, (B1 + B1_END) / 2, 13, FACADE - 0.2, false);           // entablature
addBox(g, B1_END - B1, 0.4, 1.9, limeDark, (B1 + B1_END) / 2, 14.2, FACADE + 0.05, false);   // its cornice
addBox(g, B1_END - B1, 1.2, 2.2, limeDark, (B1 + B1_END) / 2, 62, FACADE + 0.2, false);      // roof cornice
addBox(g, B1_END - B1, 0.5, 0.5, lime, (B1 + B1_END) / 2, 26.5, FACADE + 0.15, false);       // belt course
for (let k = 0; k <= 14; k++) {
  const x = B1 + k * BAY;
  addBox(g, 1.4, 1.6, 1.4, granite, x, 0.95, FACADE - 0.1);                                   // pedestal
  around(x, FACADE - 0.1, 0.7, 1.75);
  addCyl(g, 0.52, 9.6, lime, x, 6.55, FACADE - 0.1, 0.58);                                    // shaft
  addBox(g, 1.4, 0.9, 1.4, limeDark, x, 11.8, FACADE - 0.1);                                  // capital
}
addBox(g, B1_END - B1, 0.9, 0.3, granite, (B1 + B1_END) / 2, 0.6, FACADE - 0.6, false);       // granite sill

// up the street: a browner stone block, black glass towers, a brick tower, then lower blocks
block(g, B1_END, 72, FACADE - 22, FACADE, 0, 5, DARK_GLASS, 1.6, 5);
block(g, B1_END, 72, FACADE - 22, FACADE, 5, 64, STONE2, 3, 3.4);
addBox(g, 72 - B1_END, 1, 1.2, mat('#8d806d'), (B1_END + 72) / 2, 64, FACADE + 0.1, false);
block(g, 72, 96, FACADE - 26, FACADE, 0, 118, DARK_GLASS, 1.6, 3.6, mat('#2a2d33'));
block(g, 96, 112, FACADE - 18, FACADE, 0, 84, BRICK, 2.4, 3);
addBox(g, 2, 12, 2, mat('#2a2d33'), 104, 90, FACADE - 9, false);                               // rooftop mechanicals
addBox(g, 0.3, 14, 0.3, mat('#2a2d33'), 104, 103, FACADE - 9, false);                          // mast
block(g, 112, 144, FACADE - 20, FACADE, 0, 46, GREY, 2.5, 3.2);
block(g, 84, 108, -60, -38, 0, 152, DARK_GLASS, 1.6, 3.6, mat('#2a2d33'));                     // tall one behind
block(g, 30, 60, -64, -40, 0, 96, TAN, 2.6, 3.1);

// ---------- Right side ----------
// the green plywood fence along the building site, the white concrete wall closing its far end
const SITE_Z = 8.7, SITE_END = 44;
block(g, 7, SITE_END, SITE_Z, SITE_Z + 0.12, 0.15, 2.75, FENCE, 2.44, 2.6);
block(g, 7, 7.12, SITE_Z, 30, 0.15, 2.75, FENCE, 2.44, 2.6);
block(g, SITE_END, SITE_END + 3, SITE_Z, 34, 0, 9, wallMat((c, n) => {        // poured concrete, form-tie dots
  c.fillStyle = '#dcdad4'; c.fillRect(0, 0, n, n);
  c.fillStyle = '#c9c7c0'; c.fillRect(0, 60, n, 3); c.fillRect(0, 0, 3, n);
  c.fillStyle = '#b4b2ab';
  for (const x of [32, 96]) for (const y of [30, 94]) c.fillRect(x, y, 4, 4);
}), 2.4, 2.4);
block(g, SITE_END + 3, 94, SITE_Z, SITE_Z + 0.12, 0.15, 2.75, FENCE, 2.44, 2.6);
for (const [x, z, n] of [[36, 10.4, 3], [38.5, 11.5, 4], [41, 10.6, 2], [30, 16, 2]]) {
  for (let k = 0; k < n; k++) addBox(g, 2.4, 0.5, 1.2, crateMat, x, 0.35 + k * 0.5, z);          // stacks of planks
}
// excavator, arm up over the wall
const yellow = mat('#e2b01e'), black = mat('#1b1b1d');
const ex = new THREE.Group();
addBox(ex, 4.2, 1, 2.8, black, 0, 0.6, 0);                                                     // tracks
addBox(ex, 3.2, 1.6, 2.4, yellow, -0.3, 1.9, 0);                                               // body
addBox(ex, 1.2, 1.4, 1.1, mat('#33393f'), 0.7, 3.2, 0.6);                                       // cab
limb(ex, [1, 2.4, -0.4], [4, 8.5, -0.4], 0.45, yellow);                                         // boom
limb(ex, [4, 8.5, -0.4], [6.2, 5.2, -0.4], 0.35, yellow);                                       // stick
addBox(ex, 0.9, 0.9, 1, black, 6.3, 4.7, -0.4);                                                 // bucket
ex.position.set(33, 0.1, 12.5); ex.rotation.y = 0.3;
g.add(ex);
// piling rig: a tall yellow mast with a black kelly bar, by the fence on the right
addBox(g, 3.4, 1.6, 2.6, yellow, 25, 1, 17.5);
addBox(g, 4, 0.9, 3, black, 25, 0.45, 17.5);
addBox(g, 0.7, 18, 0.7, yellow, 24.2, 10, 16.4);
for (let y = 3; y < 18; y += 1.6) addBox(g, 0.9, 0.12, 0.9, mat('#b88c12'), 24.2, y, 16.4, false);
addBox(g, 0.3, 14, 0.3, black, 23.5, 8.5, 16.4);
addBox(g, 1.2, 0.6, 1.2, black, 24.2, 19.2, 16.4);

// WeWork's glass tower well up the street, a brick tower with a copper roof off to the right, a tan block
const WW = { x0: 108, x1: 138, z0: 16, z1: 62, h: 62 };
block(g, WW.x0, WW.x1, WW.z0, WW.z1, 0, WW.h, WEWORK_GLASS, 1.5, 3.8, mat('#6f7c88'));
addBox(g, WW.x1 - WW.x0 + 0.4, 1.2, WW.z1 - WW.z0 + 0.4, mat('#cfd4d8'), (WW.x0 + WW.x1) / 2, WW.h + 0.6, (WW.z0 + WW.z1) / 2, false); // roof band
{
  const logo = signMat(512, 128, (c, w, h) => {
    c.fillStyle = '#9fb0bf'; c.fillRect(0, 0, w, h);
    c.fillStyle = '#f4f6f7'; c.font = 'bold 92px Georgia, serif'; c.textBaseline = 'middle';
    c.fillText('wework', 24, h / 2 + 4);
  });
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(12, 3), logo);
  sign.position.set(WW.x0 - 0.06, WW.h - 3.4, WW.z0 + 8); sign.rotation.y = -Math.PI / 2;
  g.add(sign);
}
block(g, 92, 124, 66, 104, 0, 66, BRICK, 2.4, 3);
{
  const copper = mat('#5aa08d');
  const roof = new THREE.CylinderGeometry(0.62, 1, 1, 4, 1).rotateY(Math.PI / 4);               // hipped copper roof
  const mansard = new THREE.Mesh(roof, copper);
  mansard.scale.set(32 / Math.SQRT2, 9, 38 / Math.SQRT2);
  mansard.position.set(108, 70.5, 85);
  g.add(mansard);
  addBox(g, 4, 5, 4, copper, 108, 77.5, 85, false);                                             // lantern on top
}
block(g, 47, 92, 30, 60, 0, 14, GREY, 2.5, 3.2);                                                 // low blocks behind the site
block(g, 94, 126, 9.2, 15, 0, 46, TAN, 2.6, 3.1);
block(g, 126, 144, 9.2, 30, 0, 38, GREY, 2.5, 3.2);
block(g, -60, -14, 52, 80, 0, 40, STONE2, 3, 3.4);                                             // behind you, across the plaza

// ---------- Street furniture ----------
const pole = mat('#18181a');
// traffic signal on the near corner, mast arm out over the plaza
addCyl(g, 0.12, 6.6, pole, 3.2, 3.45, 5.3, 0.16);
addBox(g, 0.18, 0.18, 5.5, yellow, 3.2, 6, 8, false);
addBox(g, 0.4, 1.1, 0.4, yellow, 3.2, 5.4, 10.4);
for (const [y, c] of [[5.75, 0xff2a1a], [5.4, 0x000000], [5.05, 0x000000]]) addBox(g, 0.04, 0.24, 0.24, mat('#331', { emissive: c }), 2.98, y, 10.4, false);
addBox(g, 0.36, 0.4, 0.3, black, 3.0, 3, 5.3);                                                  // walk signal
around(3.2, 5.3, 0.18, 6.8);
// litter basket and a planter with a little conical shrub
addCyl(g, 0.32, 0.9, mat('#20231f'), 6, 0.6, 5.5, 0.26);
for (const y of [0.25, 0.6, 1.0]) addCyl(g, 0.335, 0.05, mat('#2f332e'), 6, y, 5.5);
around(6, 5.5, 0.33, 1.05);
addCyl(g, 0.7, 0.75, mat('#c7c2b6'), 9, 0.52, 5.9, 0.6);
around(9, 5.9, 0.68, 2.9);
for (const [r, h, y] of [[0.75, 1.1, 1.4], [0.55, 0.9, 2], [0.35, 0.7, 2.5]]) {
  const cone = new THREE.Mesh(new THREE.ConeGeometry(r, h, 7), mat('#3e6634'));
  cone.position.set(9, y, 5.9); cone.castShadow = true; g.add(cone);
}
// SPEED LIMIT 10 and NO STANDING
const speed = signMat(96, 120, (c, w, h) => {
  c.fillStyle = '#f4f4f0'; c.fillRect(0, 0, w, h);
  c.strokeStyle = '#111'; c.lineWidth = 4; c.strokeRect(5, 5, w - 10, h - 10);
  c.fillStyle = '#111'; c.textAlign = 'center';
  c.font = 'bold 19px Arial, sans-serif'; c.fillText('SPEED', w / 2, 32); c.fillText('LIMIT', w / 2, 52);
  c.font = 'bold 50px Arial, sans-serif'; c.fillText('10', w / 2, 104);
});
addBox(g, 0.06, 3, 0.06, mat('#6c6f73'), 16.6, 1.6, 4.9);
addBox(g, 0.03, 0.8, 0.64, speed, 16.55, 2.75, 4.9, false);
around(16.6, 4.9, 0.05, 3.1);
const noStanding = signMat(64, 96, (c, w, h) => {
  c.fillStyle = '#c8302b'; c.fillRect(0, 0, w, h);
  c.fillStyle = '#fff'; c.textAlign = 'center'; c.font = 'bold 12px Arial, sans-serif';
  c.fillText('NO', w / 2, 34); c.fillText('STANDING', w / 2, 52); c.fillText('ANYTIME', w / 2, 70);
});
addBox(g, 0.06, 3, 0.06, mat('#6c6f73'), 7.6, 1.6, -4.9);
addBox(g, 0.03, 0.6, 0.42, noStanding, 7.55, 2.6, -4.9, false);
around(7.6, -4.9, 0.05, 3.1);
// the line of Jersey barriers coning off the right of the road
for (let k = 0; k < 26; k++) {
  const x = 18 + k * 1.65, z = k < 2 ? 1.3 + k * 0.3 : 1.9;
  addBox(g, 1.6, 0.8, 0.45, mat('#c9c6bd'), x, 0.4, z);
  for (const y of [0.55, 0.68]) addBox(g, 1.62, 0.07, 0.47, mat('#e86a1f'), x, y, z, false);
  solid(x - 0.8, x + 0.8, z - 0.225, z + 0.225, 0.8);
}
// streetlamps and the trees at the far end by the park
for (const x of [24, 66, 108]) {
  addBox(g, 0.16, 8, 0.16, pole, x, 4.1, -4.8);
  addBox(g, 0.12, 0.12, 2, pole, x, 8, -3.9);
  addBox(g, 0.5, 0.18, 0.4, mat('#e6e2d6'), x, 7.9, -3);
  around(x, -4.8, 0.08, 8.1);
}
function tree(x, z, s) {
  addCyl(g, 0.15 * s, 3 * s, mat('#4b3b2e'), x, 1.6 * s, z, 0.2 * s);
  around(x, z, 0.2 * s, 3 * s);
  const r = seeded(Math.round(x * 31 + z * 7));
  for (let k = 0; k < 5; k++) {
    const w = (1.8 + r() * 1.4) * s;
    addBox(g, w, w * 0.8, w, mat(k % 2 ? '#5d7d47' : '#4d6c3c'), x + (r() - 0.5) * 2 * s, (3.4 + r() * 1.6) * s, z + (r() - 0.5) * 2 * s);
  }
}
for (const [x, z, s] of [[-4, 16, 1.4], [3, 24, 1.6], [-14, 20, 1.3], [146, -7, 1.6], [150, -14, 2], [158, -9, 1.8], [149, 9, 1.8], [160, 14, 2.2], [168, -2, 2.4], [172, 8, 2.2], [176, -12, 2.6]]) tree(x, z, s);
{
  const far = seeded(77);
  for (let x = 185; x < 300; x += 12 + far() * 10) {
    for (const side of [-1, 1]) {
      const h = 12 + far() * 26;
      block(g, x, x + 10 + far() * 6, side < 0 ? -40 : 12, side < 0 ? -12 : 40, 0, h, far() < 0.5 ? GREY : TAN, 2.5, 3.2);
    }
  }
}

// ---------- Cars ----------
// kind: 'sedan', 'tlc' (white for-hire car with the green stripe), 'suv' (the boxy grey 4x4), 'van'
function buildCar(kind, color) {
  const c = new THREE.Group();
  const paint = mat(color);
  const glass = mat('#2d3640', { metalness: 0.4, roughness: 0.3 });
  const tyre = mat('#141414'), tail = mat('#c72a2a', { emissive: 0x550000 });
  if (kind === 'van') {
    addBox(c, 5.4, 2.1, 2, paint, 0, 1.35, 0);
    addBox(c, 1.1, 0.7, 1.9, glass, 2.25, 1.9, 0);
  } else if (kind === 'suv') {
    addBox(c, 4.6, 0.85, 1.9, paint, 0, 0.85, 0);
    addBox(c, 3.2, 0.75, 1.8, glass, -0.4, 1.66, 0);
    addBox(c, 3.24, 0.1, 1.84, paint, -0.4, 2.07, 0);
    for (const dz of [-0.92, 0.92]) addBox(c, 3.1, 0.08, 0.05, mat('#222'), -0.4, 2.14, dz * 0.9, false); // roof rails
    addBox(c, 0.12, 0.7, 0.9, mat('#3a3d40'), -2.35, 0.95, 0);                                        // spare / tailgate
  } else {
    addBox(c, 4.5, 0.65, 1.78, paint, 0, 0.68, 0);
    addBox(c, 2.5, 0.52, 1.6, glass, -0.3, 1.27, 0);
    addBox(c, 2.3, 0.06, 1.56, paint, -0.3, 1.55, 0);
    if (kind === 'tlc') {
      for (const dz of [-0.9, 0.9]) addBox(c, 3.8, 0.12, 0.02, mat('#2e9b4e'), 0, 0.8, dz, false);
      addBox(c, 0.7, 0.2, 0.3, mat('#f4f4f0', { emissive: 0x333333 }), -0.2, 1.68, 0);
    }
  }
  const half = kind === 'van' ? 2.7 : kind === 'suv' ? 2.3 : 2.25;
  for (const dx of [-half + 0.8, half - 0.8]) for (const dz of [-0.82, 0.82]) addBox(c, 0.68, 0.66, 0.26, tyre, dx, 0.33, dz * (kind === 'van' || kind === 'suv' ? 1.08 : 1));
  for (const dz of [-0.65, 0.65]) {
    addBox(c, 0.05, 0.18, 0.28, tail, -half - 0.01, kind === 'van' ? 1.2 : 0.85, dz, false);
    addBox(c, 0.05, 0.14, 0.3, mat('#fff6d8', { emissive: 0x555544 }), half + 0.01, 0.75, dz, false);
  }
  c.traverse(m => { if (m.isMesh) m.castShadow = true; });
  return c;
}
// collision for each kind: [length, width, offset along the car, top] for the body and the cabin
const CAR_BOXES = { sedan: [[4.5, 1.78, 0, 1.0], [2.5, 1.6, -0.3, 1.58]], suv: [[4.6, 1.9, 0, 1.28], [3.24, 1.84, -0.4, 2.12]], van: [[5.4, 2, 0, 2.4]] };
CAR_BOXES.tlc = CAR_BOXES.sedan;
function park(kind, color, x, z) {
  const c = buildCar(kind, color);
  c.position.set(x, 0, z);
  g.add(c);
  c.userData.boxes = CAR_BOXES[kind].map(([len, w, dx, top]) => Object.assign(solid(x + dx - len / 2, x + dx + len / 2, z - w / 2, z + w / 2, top), { len, dx }));
  return c;
}
const LEFT_ROW = [['tlc', '#f2f2ee'], ['sedan', '#5b6b82'], ['sedan', '#b9bcc0'], ['sedan', '#2a2c31'], ['suv', '#ece9e2'],
  ['sedan', '#7d8187'], ['sedan', '#1e2a3a'], ['suv', '#3b3e44'], ['sedan', '#d9d6cf'], ['sedan', '#8a2f2f'], ['sedan', '#cfd2d4']];
LEFT_ROW.forEach(([kind, color], k) => park(kind, color, 12.4 + k * 5.4, -3.45));
park('suv', '#8f9497', 12, 3.1);
const moving = [
  { car: park('van', '#f0efea', 70, -0.4), half: 2.7, speed: 3.5, v: 3.5 },
  { car: park('sedan', '#2f3238', 120, -0.4), half: 2.25, speed: 5, v: 5 },
];

// ---------- People ----------
function buildPerson(top, legs, skinC = '#c99a7a', hair = '#2a201a') {
  const p = new THREE.Group();
  const skin = mat(skinC), shoe = mat('#1d1d1f');
  addBox(p, 0.26, 0.62, 0.42, mat(top), 0, 1.22, 0);            // torso
  addBox(p, 0.22, 0.24, 0.2, skin, 0.01, 1.66, 0);              // head
  addBox(p, 0.24, 0.08, 0.22, mat(hair), -0.01, 1.8, 0);        // hair
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
  g.add(p);
  return { p, limbs, phase: Math.random() * 6 };
}
const walkers = [
  { ...buildPerson('#7a5434', '#2a2c30'), x: 9, z: -7.8, dir: -1, speed: 1.2, range: [-25, 40] },
  { ...buildPerson('#e8e6e1', '#262a33', '#d9ad8c', '#4a3320'), x: 16, z: -6.6, dir: -1, speed: 1.1, range: [-25, 50] },
  { ...buildPerson('#2f3a4f', '#3a3a3a'), x: 22, z: -8.8, dir: 1, speed: 1.3, range: [-10, 70] },
  { ...buildPerson('#9a2e2e', '#24262b', '#8a5f45'), x: 30, z: -6.4, dir: -1, speed: 1.0, range: [-10, 70] },
  { ...buildPerson('#d6c39a', '#41444a', '#e0b896', '#8a6a3a'), x: 36, z: -8, dir: 1, speed: 1.2, range: [-10, 80] },
  { ...buildPerson('#3d4d3a', '#2a2a2e', '#6e4a36'), x: -2, z: 20, dir: 1, speed: 0.9, range: [-30, 5] },
];

// ---------- The hero: the game's ragdoll, in whichever skin was last picked ----------
const saved = localStorage.getItem('ragdollSkin');
const hero = new Ragdoll(3, -6.8, { world: MONTAGUE, skin: SKINS[saved] ? saved : 'newyorker' });
const queued = { jump: false, punch: false, kick: false };
const whoEl = document.getElementById('who'), helpEl = document.getElementById('help');
function showSkin() { whoEl.textContent = `Walking as: ${SKINS[hero.skin].name} (C to change)`; }
function nextSkin() {
  hero.setSkin(SKIN_ORDER[(SKIN_ORDER.indexOf(hero.skin) + 1) % SKIN_ORDER.length]);
  localStorage.setItem('ragdollSkin', hero.skin);
  showSkin();
}

// the moving cars ease to a stop behind the other car or the hero standing in their lane
function driveTraffic() {
  for (const m of moving) {
    const front = m.car.position.x + m.half;
    let gap = Infinity;
    if (Math.abs(hero.z - m.car.position.z) < 1.6 && hero.y < 2.5 && hero.x - front > -0.6) gap = hero.x - front;
    for (const o of moving) {
      const d = o.car.position.x - o.half - front;
      if (o !== m && d > -0.5) gap = Math.min(gap, d);
    }
    const want = gap < 2 ? 0 : gap < 8 ? m.speed * (gap - 2) / 6 : m.speed;
    m.v += (want - m.v) * 0.08;
    m.car.position.x += m.v / 60;
    if (m.car.position.x > 150) m.car.position.x = -30;
    for (const b of m.car.userData.boxes) { b.x0 = m.car.position.x + b.dx - b.len / 2; b.x1 = b.x0 + b.len; }
  }
}

// ---------- Cameras: over the hero's shoulder ('walk'), or free like Street View ('look') ----------
const PHOTO = { x: 0, y: 2.4, z: 0, yaw: -Math.PI / 2, pitch: 0.06, fov: 60 };
const view = { ...PHOTO };
const HELP = {
  walk: '↑ ↓ / W S walk · ← → / A D or drag to turn · Shift run · wheel zoom<br>Space jump (again for a flip) · F punch · G kick · H round kick<br>M music · V free camera · R the photo\'s view',
  look: 'Drag to look · wheel to zoom<br>W A S D / arrows to fly · Shift faster · Q E down / up<br>R the photo\'s view · V back to walking',
};
let mode = 'walk', walkYaw = 0, walkDist = 5, snapCam = true;
const camPos = new THREE.Vector3(), camTarget = new THREE.Vector3();
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
function resetView() { setMode('look'); Object.assign(view, PHOTO); }

const keys = {};
addEventListener('keydown', e => {
  keys[e.code] = true;
  if (e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault();
  if (e.repeat) return;
  if (mode === 'walk') {
    if (e.code === 'Space') queued.jump = true;
    if (e.code === 'KeyF') queued.punch = true;
    if (e.code === 'KeyG') queued.kick = true;
    if (e.code === 'KeyH') queued.kick = 'round';
  }
  if (e.code === 'KeyC') nextSkin();
  if (e.code === 'KeyM') { music.start(); music.toggle(); }
  if (e.code === 'KeyV') setMode(mode === 'walk' ? 'look' : 'walk');
  if (e.code === 'KeyR') resetView();
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
  view.yaw += dx * k;
  view.pitch = Math.max(-1.3, Math.min(1.3, view.pitch + dy * k));
});
renderer.domElement.addEventListener('wheel', e => {
  e.preventDefault();
  if (mode === 'walk') walkDist = Math.max(2.5, Math.min(14, walkDist + e.deltaY * 0.01));
  else view.fov = Math.max(20, Math.min(85, view.fov + e.deltaY * 0.03));
}, { passive: false });

// one 60 Hz step, like the game's: the ragdoll's tuning is all in frames
function tick() {
  let ix = 0, iz = 0;
  if (mode === 'walk') {
    walkYaw += ((keys.ArrowRight || keys.KeyD ? 1 : 0) - (keys.ArrowLeft || keys.KeyA ? 1 : 0)) * 0.045;
    const fwd = (keys.KeyW || keys.ArrowUp ? 1 : 0) - (keys.KeyS || keys.ArrowDown ? 1 : 0);
    const pace = keys.ShiftLeft || keys.ShiftRight ? 1 : 0.45;
    ix = Math.cos(walkYaw) * fwd * pace; iz = Math.sin(walkYaw) * fwd * pace;
  }
  hero.control(ix, iz, queued.jump, queued.punch, queued.kick);
  queued.jump = queued.punch = queued.kick = false;
  hero.step();
  updateDust();
  driveTraffic();
}

function followHero() {
  const hip = hero.pts.hip, cx = Math.cos(walkYaw), cz = Math.sin(walkYaw);
  // kept out of the facades on the left and the building-site fence on the right
  const tz = Math.max(-9.6, Math.min(hip.x > 6.5 && hip.x < 95 ? 8.3 : 47, hip.z - cz * walkDist));
  camTarget.set(hip.x - cx * walkDist, 1.2 + walkDist * 0.32 + hero.y * 0.6, tz);
  if (snapCam) { camPos.copy(camTarget); snapCam = false; } else camPos.lerp(camTarget, 0.15);
  camera.position.copy(camPos);
  camera.lookAt(hip.x + cx * 4, 1.4 + hero.y * 0.5, hip.z + cz * 4);
  if (camera.fov !== 62) { camera.fov = 62; camera.updateProjectionMatrix(); }
}
function flyCamera(dt) {
  const run = (keys.ShiftLeft || keys.ShiftRight ? 14 : 4) * dt;
  const fwd = (keys.KeyW || keys.ArrowUp ? 1 : 0) - (keys.KeyS || keys.ArrowDown ? 1 : 0);
  const strafe = (keys.KeyD ? 1 : 0) - (keys.KeyA ? 1 : 0);
  const turn = (keys.ArrowLeft ? 1 : 0) - (keys.ArrowRight ? 1 : 0);
  view.yaw += turn * 1.6 * dt;
  view.x += (-Math.sin(view.yaw) * fwd + Math.cos(view.yaw) * strafe) * run;
  view.z += (-Math.cos(view.yaw) * fwd - Math.sin(view.yaw) * strafe) * run;
  view.y = Math.max(0.6, view.y + ((keys.KeyE ? 1 : 0) - (keys.KeyQ ? 1 : 0)) * run);
  camera.position.set(view.x, view.y, view.z);
  camera.rotation.set(view.pitch, view.yaw, 0, 'YXZ');
  if (camera.fov !== view.fov) { camera.fov = view.fov; camera.updateProjectionMatrix(); }
}

const clock = new THREE.Clock();
let acc = 0;
function frame() {
  const dt = Math.min(clock.getDelta(), 0.05), t = clock.elapsedTime;
  for (acc += dt; acc >= 1 / 60; acc -= 1 / 60) tick();
  if (mode === 'walk') followHero(); else flyCamera(dt);
  for (const w of walkers) {
    w.x += w.dir * w.speed * dt;
    if (w.x < w.range[0]) w.x = w.range[1];
    if (w.x > w.range[1]) w.x = w.range[0];
    const s = (t * w.speed * 3.2 + w.phase);
    w.p.position.set(w.x, 0.15 + Math.abs(Math.sin(s)) * 0.03, w.z);
    w.p.rotation.y = w.dir > 0 ? 0 : Math.PI;
    for (const { leg, arm, side } of w.limbs) {
      leg.rotation.z = Math.sin(s) * 0.45 * side;
      arm.rotation.z = -Math.sin(s) * 0.35 * side;
    }
  }
  hero.updateMeshes();
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
showSkin();
setMode('walk');
frame();

window.street = { view, resetView, setMode, camera, scene, renderer, hero, keys, queued, boxes, tick };
