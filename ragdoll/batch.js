// Merged geometry for big static scenes: boxes, wedges and odd faces collected per material and per patch
// of the map, then drawn as a handful of meshes; plus instanced copies of a template.
import * as THREE from 'three';

const PATCH = 200;   // metres; each material gets one mesh per patch, so the patches out of view get culled

export class Batch {
  constructor(patched = true) { this.patched = patched; this.groups = new Map(); }

  arrays(material, x, z) {
    const key = material.uuid + (this.patched ? `|${Math.floor(x / PATCH)},${Math.floor(z / PATCH)}` : '');
    let a = this.groups.get(key);
    if (!a) { a = { material, pos: [], nor: [], uv: [], col: [] }; this.groups.set(key, a); }
    return a;
  }

  // a convex polygon, wound counter-clockwise seen from outside; uvs optional, color for vertex-coloured materials
  poly(material, pts, uvs, color) {
    const a = this.arrays(material, pts[0][0], pts[0][2]);
    const [p, q, r] = pts;
    const ux = q[0] - p[0], uy = q[1] - p[1], uz = q[2] - p[2], vx = r[0] - p[0], vy = r[1] - p[1], vz = r[2] - p[2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
    const c = color || WHITE;
    for (let k = 1; k < pts.length - 1; k++) {
      for (const i of [0, k, k + 1]) {
        a.pos.push(...pts[i]); a.nor.push(nx, ny, nz);
        a.uv.push(...(uvs ? uvs[i] : [0, 0])); a.col.push(c.r, c.g, c.b);
      }
    }
  }

  // a polygon that faces away from `inside`, whichever way its points were listed
  facing(material, pts, inside, uvs, color) {
    const [p, q, r] = pts;
    const n = new THREE.Vector3().crossVectors(V1.set(q[0] - p[0], q[1] - p[1], q[2] - p[2]), V2.set(r[0] - p[0], r[1] - p[1], r[2] - p[2]));
    const cx = pts.reduce((s, t) => s + t[0], 0) / pts.length, cy = pts.reduce((s, t) => s + t[1], 0) / pts.length, cz = pts.reduce((s, t) => s + t[2], 0) / pts.length;
    if (n.x * (cx - inside[0]) + n.y * (cy - inside[1]) + n.z * (cz - inside[2]) < 0) {
      pts = [...pts].reverse(); if (uvs) uvs = [...uvs].reverse();
    }
    this.poly(material, pts, uvs, color);
  }

  // an axis-aligned box. o: { mat, top (the roof's material), color, topColor, tw, th (metres per texture tile),
  // bottom (draw the underside too) }
  box(x0, x1, y0, y1, z0, z1, o) {
    const m = o.mat, t = o.top || m, c = toColor(o.color), tc = o.topColor ? toColor(o.topColor) : c;
    const tw = o.tw || 1e9, th = o.th || 1e9;
    const dx = (x1 - x0) / tw, dz = (z1 - z0) / tw, v = (y1 - y0) / th;
    const wall = (pts, u) => this.poly(m, pts, [[0, 0], [u, 0], [u, v], [0, v]], c);
    wall([[x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1]], dz);
    wall([[x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]], dz);
    wall([[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]], dx);
    wall([[x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0]], dx);
    const tu = (x1 - x0) / (o.top ? 8 : tw), tv = (z1 - z0) / (o.top ? 8 : th);
    this.poly(t, [[x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0]], [[0, 0], [tu, 0], [tu, tv], [0, tv]], tc);
    if (o.bottom) this.poly(m, [[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]], null, c);
  }

  // a prism: the convex outline poly ([[s, y], …], s being z when axis is 'x' and x when axis is 'z')
  // stretched from a0 to a1 along the axis
  prism(material, axis, a0, a1, outline, color) {
    const c = toColor(color);
    const at = (a, [s, y]) => axis === 'x' ? [a, y, s] : [s, y, a];
    const ms = outline.reduce((s, p) => s + p[0], 0) / outline.length, my = outline.reduce((s, p) => s + p[1], 0) / outline.length;
    const inside = at((a0 + a1) / 2, [ms, my]);
    this.facing(material, outline.map(p => at(a0, p)), inside, null, c);
    this.facing(material, outline.map(p => at(a1, p)), inside, null, c);
    for (let i = 0; i < outline.length; i++) {
      const p = outline[i], q = outline[(i + 1) % outline.length];
      this.facing(material, [at(a0, p), at(a0, q), at(a1, q), at(a1, p)], inside, null, c);
    }
  }

  // any BufferGeometry, moved by a matrix
  geometry(material, geo, matrix, color) {
    const g = geo.index ? geo.toNonIndexed() : geo;
    const p = g.attributes.position, n = g.attributes.normal, uv = g.attributes.uv;
    const nm = new THREE.Matrix3().getNormalMatrix(matrix), v = new THREE.Vector3(), c = toColor(color);
    const e = matrix.elements;
    const a = this.arrays(material, e[12], e[14]);
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i).applyMatrix4(matrix); a.pos.push(v.x, v.y, v.z);
      v.fromBufferAttribute(n, i).applyMatrix3(nm).normalize(); a.nor.push(v.x, v.y, v.z);
      a.uv.push(uv ? uv.getX(i) : 0, uv ? uv.getY(i) : 0); a.col.push(c.r, c.g, c.b);
    }
  }

  // everything collected, as meshes added to parent
  finish(parent) {
    for (const a of this.groups.values()) {
      const mesh = new THREE.Mesh(toGeometry(a), a.material);
      mesh.castShadow = a.material.userData.cast !== false;
      mesh.receiveShadow = true;
      parent.add(mesh);
    }
    this.groups.clear();
  }

  // everything collected (one material), as a single geometry for instancing
  merged() {
    const all = { pos: [], nor: [], uv: [], col: [] };
    for (const a of this.groups.values()) for (const k in all) all[k].push(...a[k]);
    return toGeometry(all);
  }
}

const WHITE = new THREE.Color(1, 1, 1), V1 = new THREE.Vector3(), V2 = new THREE.Vector3();
const colorCache = new Map();
function toColor(c) {
  if (!c) return WHITE;
  if (c.isColor) return c;
  if (!colorCache.has(c)) colorCache.set(c, new THREE.Color(c));
  return colorCache.get(c);
}
function toGeometry(a) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(a.pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(a.nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(a.uv, 2));
  g.setAttribute('color', new THREE.Float32BufferAttribute(a.col, 3));
  g.computeBoundingSphere();
  return g;
}

// one InstancedMesh of a template: items are { x, y, z, ry, s, sy, color }
export function instanced(geo, material, items, cast = true) {
  const m = new THREE.InstancedMesh(geo, material, Math.max(1, items.length));
  m.count = items.length;
  const o = new THREE.Object3D(), c = new THREE.Color();
  items.forEach((p, i) => {
    o.position.set(p.x, p.y, p.z);
    o.rotation.set(0, p.ry || 0, 0);
    o.scale.set(p.s || 1, p.sy || p.s || 1, p.s || 1);
    o.updateMatrix();
    m.setMatrixAt(i, o.matrix);
    if (p.color) m.setColorAt(i, c.set(p.color));
  });
  m.castShadow = cast; m.receiveShadow = true;
  m.computeBoundingSphere();
  return m;
}

// a vertex-coloured material (for the batches of plain-coloured boxes), and a tiled texture one
export function colorMat(extra = {}) {
  return new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, flatShading: true, ...extra });
}
