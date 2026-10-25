// Renderer, scene, sky, fog, camera, lights and stars.
import * as THREE from 'three';
import { seeded } from './config.js';

// ---------- Renderer, scene, camera, lights ----------
export const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.prepend(renderer.domElement);

export const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0xe0857a, 35, 260);
{
  const c = document.createElement('canvas'); c.width = 2; c.height = 512;
  const g = c.getContext('2d');
  const gr = g.createLinearGradient(0, 0, 0, 512);
  gr.addColorStop(0, '#141a3d'); gr.addColorStop(0.4, '#4a3570'); gr.addColorStop(0.7, '#c86a72'); gr.addColorStop(1, '#f7b56c');
  g.fillStyle = gr; g.fillRect(0, 0, 2, 512);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  scene.background = t;
}

export const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 700);
addEventListener('resize', () => {
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
});

export const hemi = new THREE.HemisphereLight(0xb9a8ec, 0x3b2a3a, 1.3);
scene.add(hemi);
export const keyLight = new THREE.DirectionalLight(0xffd8b0, 1.7);
keyLight.castShadow = true;
keyLight.shadow.mapSize.set(2048, 2048);
Object.assign(keyLight.shadow.camera, { left: -16, right: 16, top: 16, bottom: -16, near: 1, far: 60 });
keyLight.shadow.bias = -0.0005;
scene.add(keyLight, keyLight.target);
export const sunsetRim = new THREE.DirectionalLight(0xff8a5c, 0.7);
sunsetRim.position.set(0, 8, -30);
scene.add(sunsetRim);

export const stars = (() => {
  const pos = [];
  const rnd = seeded(5);
  for (let i = 0; i < 500; i++) {
    const a = rnd() * Math.PI, e = 0.25 + rnd() * 1.1;
    pos.push(Math.cos(a) * 450, 60 + Math.sin(e) * 300, -Math.sin(a) * 450 - 50);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  const p = new THREE.Points(g, new THREE.PointsMaterial({ color: 0xffffff, size: 1.4, sizeAttenuation: false, fog: false }));
  scene.add(p);
  return p;
})();
