// Dust puffs for landings, hits and stomps.
import * as THREE from 'three';
import { scene } from './scene.js';
import { boxGeo } from './materials.js';

export const dustPool = [];
for (let i = 0; i < 80; i++) {
  const m = new THREE.Mesh(boxGeo(0.08, 0.08, 0.08), new THREE.MeshBasicMaterial({ color: 0xe6d2be, transparent: true }));
  m.visible = false; scene.add(m);
  dustPool.push({ m, life: 0, vx: 0, vy: 0, vz: 0 });
}
export let dustIdx = 0;
export function dust(x, y, z, n = 8) {
  for (let i = 0; i < n; i++) {
    const p = dustPool[dustIdx++ % dustPool.length];
    p.m.position.set(x + (Math.random() - 0.5) * 0.3, y + 0.05, z + (Math.random() - 0.5) * 0.3);
    p.vx = (Math.random() - 0.5) * 0.05; p.vy = Math.random() * 0.03; p.vz = (Math.random() - 0.5) * 0.05;
    p.life = 30 + Math.random() * 20; p.m.visible = true;
  }
}

export function updateDust() {
  for (const p of dustPool) {
    if (p.life <= 0) continue;
    p.m.position.x += p.vx; p.m.position.y += p.vy; p.m.position.z += p.vz;
    p.vy -= 0.001;
    p.m.material.opacity = p.life / 50;
    if (--p.life <= 0) p.m.visible = false;
  }
}
