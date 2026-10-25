// Shared geometry and materials: cached boxes and colours, painted textures,
// apartment facades, and helpers for placing boxes between points.
import * as THREE from 'three';
import { seeded } from './config.js';

// ---------- Shared geometry / materials ----------
export const geoCache = new Map();
export function boxGeo(w, h, d) {
  const k = `${w}|${h}|${d}`;
  if (!geoCache.has(k)) geoCache.set(k, new THREE.BoxGeometry(w, h, d));
  return geoCache.get(k);
}
export const matCache = new Map();
export function mat(color, extra = {}) {
  const k = color + JSON.stringify(extra);
  if (!matCache.has(k)) matCache.set(k, new THREE.MeshStandardMaterial({ color, roughness: 0.85, flatShading: true, ...extra }));
  return matCache.get(k);
}
export function addBox(group, w, h, d, material, x, y, z, cast = true) {
  const m = new THREE.Mesh(boxGeo(w, h, d), material);
  m.position.set(x, y, z);
  m.castShadow = cast; m.receiveShadow = true;
  group.add(m);
  return m;
}
export function canvasTex(size, paint) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  paint(c.getContext('2d'), size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.NearestFilter;
  return t;
}

// building facades: a tile of windows, some lit; the emissive map makes the lit ones glow at dusk
export function facadeMaterial(seed, wall) {
  const rnd = seeded(seed);
  const litMap = [];
  for (let i = 0; i < 64; i++) litMap.push(rnd() < 0.45);
  const draw = (emissive) => (g, n) => {
    g.fillStyle = emissive ? '#000' : wall; g.fillRect(0, 0, n, n);
    for (let i = 0; i < 64; i++) {
      const cx = (i % 8) * 32, cy = Math.floor(i / 8) * 32;
      g.fillStyle = litMap[i] ? '#ffd88a' : (emissive ? '#000' : '#3a3150');
      g.fillRect(cx + 9, cy + 8, 14, 17);
    }
  };
  return new THREE.MeshStandardMaterial({
    map: canvasTex(256, draw(false)), emissiveMap: canvasTex(256, draw(true)),
    emissive: 0xffffff, emissiveIntensity: 0.9, roughness: 0.9,
  });
}
export const facades = [facadeMaterial(1, '#7d6293'), facadeMaterial(2, '#6b5a86'), facadeMaterial(3, '#8f6f93')];
export const roofMat = mat('#4a3d5e');

// box with windows on the walls, scaled so windows stay the same size on any building
export function buildingGeo(w, h, d) {
  const g = new THREE.BoxGeometry(w, h, d);
  const uv = g.attributes.uv;
  const faceSize = [[d, h], [d, h], [1, 1], [1, 1], [w, h], [w, h]];
  for (let f = 0; f < 6; f++) {
    const [fw, fh] = faceSize[f];
    const sx = f === 2 || f === 3 ? 1 : fw / 8, sy = f === 2 || f === 3 ? 1 : fh / 9;
    for (let v = f * 4; v < f * 4 + 4; v++) uv.setXY(v, uv.getX(v) * sx, uv.getY(v) * sy);
  }
  return g;
}
export function addBuilding(group, disposables, x, z, w, h, d, variant, base = 0) {
  const g = buildingGeo(w, h, d);
  disposables.push(g);
  const f = facades[variant];
  const m = new THREE.Mesh(g, [f, f, roofMat, roofMat, f, f]);
  m.position.set(x, base + h / 2, z);
  m.receiveShadow = true;
  group.add(m);
  return m;
}

export const crateTex = canvasTex(64, (g, n) => {
  g.fillStyle = '#b07a43'; g.fillRect(0, 0, n, n);
  g.strokeStyle = '#6e4622'; g.lineWidth = 6;
  g.strokeRect(3, 3, n - 6, n - 6);
  g.beginPath(); g.moveTo(6, 6); g.lineTo(n - 6, n - 6); g.stroke();
});
export const crateMat = new THREE.MeshStandardMaterial({ map: crateTex, roughness: 0.9 });
export const glowTex = (() => {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(32, 32, 1, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,225,150,0.9)'); gr.addColorStop(1, 'rgba(255,225,150,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
})();
export const glowMat = new THREE.SpriteMaterial({ map: glowTex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true });

export const cylCache = new Map();
export function cylGeo(rTop, rBottom, hh) {
  const k = `${rTop}|${rBottom}|${hh}`;
  if (!cylCache.has(k)) cylCache.set(k, new THREE.CylinderGeometry(rTop, rBottom, hh, 10));
  return cylCache.get(k);
}

export const _y = new THREE.Vector3(), _z = new THREE.Vector3(), _x = new THREE.Vector3(), _m = new THREE.Matrix4();
export function orient(mesh, ax, ay, az, bx, by, bz, side) {
  _y.set(bx - ax, by - ay, bz - az);
  const len = _y.length() || 1e-6;
  _y.divideScalar(len);
  _z.copy(side).addScaledVector(_y, -side.dot(_y));
  if (_z.lengthSq() < 1e-6) _z.set(0, 0, 1);
  _z.normalize();
  _x.crossVectors(_y, _z);
  _m.makeBasis(_x, _y, _z);
  mesh.quaternion.setFromRotationMatrix(_m);
  mesh.position.set((ax + bx) / 2, (ay + by) / 2, (az + bz) / 2);
}

// a box stretched between two points, for limbs in a fixed pose
export const _side = new THREE.Vector3();
export function limb(parent, a, b, w, m) {
  const len = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
  const mesh = new THREE.Mesh(boxGeo(w, len, w), m);
  const alongZ = Math.abs(b[2] - a[2]) / len > 0.7;
  orient(mesh, ...a, ...b, _side.set(0, alongZ ? 1 : 0, alongZ ? 0 : 1));
  mesh.castShadow = true; parent.add(mesh);
  return mesh;
}
// the joint between a and b when both segments are len long, bent towards hint
export function bendPoint(a, b, len, hint) {
  const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b);
  const half = A.distanceTo(B) / 2;
  const dir = B.clone().sub(A).normalize();
  const h = new THREE.Vector3(...hint);
  h.addScaledVector(dir, -h.dot(dir)).normalize();
  return A.add(B).multiplyScalar(0.5).addScaledVector(h, Math.sqrt(Math.max(0, len * len - half * half))).toArray();
}
