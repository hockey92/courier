// The guy chilling on his cardboard by the fence, with his sign, boombox and music notes.
import * as THREE from 'three';
import { addBox, bendPoint, boxGeo, crateMat, limb, mat } from './materials.js';

// ---------- The guy chilling on the sidewalk ----------
export const noteTex = (() => {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d');
  g.fillStyle = '#fff3b0'; g.font = 'bold 52px serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText('♪', 32, 34);
  return new THREE.CanvasTexture(c);
})();
export const signMat = (() => {
  const c = document.createElement('canvas'); c.width = 256; c.height = 160;
  const g = c.getContext('2d');
  g.fillStyle = '#b58a57'; g.fillRect(0, 0, 256, 160);
  g.fillStyle = '#2a2018'; g.font = 'bold 36px "Marker Felt", "Comic Sans MS", sans-serif'; g.textAlign = 'center';
  g.fillText('ANYTHING', 128, 66); g.fillText('HELPS :)', 128, 114);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return new THREE.MeshStandardMaterial({ map: t, roughness: 0.95 });
})();

// Lying on his back on cardboard: hands behind his head, one leg crossed over the other knee,
// foot tapping along to his boombox. Returns a function that animates him.
export function buildHomeless(g, disposables, { x, z }) {
  const p = new THREE.Group();
  p.position.set(x, 0, z);
  g.add(p);
  const jacket = mat('#5e5843'), pants = mat('#4b4d57'), skin = mat('#c99470');
  const beard = mat('#8d8178'), shoe = mat('#3a2e26'), dark = mat('#1a1a1a');

  addBox(p, 1.1, 0.03, 0.78, mat('#a57a4c'), -0.45, 0.015, 0);                // cardboard
  addBox(p, 1.0, 0.035, 0.74, mat('#977046'), 0.5, 0.0175, 0.02);
  const sign = new THREE.Mesh(boxGeo(0.62, 0.4, 0.02), [crateMat, crateMat, crateMat, crateMat, signMat, crateMat]);
  sign.position.set(-0.15, 0.22, -0.36); sign.rotation.x = -0.25; sign.castShadow = true;
  p.add(sign);                                                                   // sign leaning on the wall
  addBox(p, 0.09, 0.11, 0.09, mat('#9aa0a6', { metalness: 0.5 }), -0.3, 0.055, 0.5); // can for change

  const torso = addBox(p, 0.55, 0.2, 0.32, jacket, 0.15, 0.13, 0);
  addBox(p, 0.1, 0.14, 0.3, mat('#4d4836'), 0.44, 0.15, 0);                     // hood bunched at the neck
  addBox(p, 0.28, 0.12, 0.38, mat('#3f5a6e'), 0.66, 0.09, 0);                   // rolled-up bag as a pillow

  // head, tipped towards the street so we can see his face
  const hd = new THREE.Group();
  hd.position.set(0.64, 0.285, 0.02); hd.rotation.x = 0.55;
  p.add(hd);
  const h = 0.135;
  addBox(hd, 0.27, 0.27, 0.27, skin, 0, 0, 0);
  addBox(hd, 0.11, 0.29, 0.29, mat('#b4442f'), 0.09, 0, 0);                     // beanie
  addBox(hd, 0.06, 0.06, 0.06, mat('#e0c070'), 0.17, 0, 0);                     // pom-pom
  for (const s of [-1, 1]) addBox(hd, 0.015, 0.01, 0.05, dark, 0.02, h + 0.005, s * 0.06); // eyes shut, relaxed
  addBox(hd, 0.04, 0.04, 0.04, mat('#b98262'), -0.015, h + 0.02, 0);            // nose
  addBox(hd, 0.12, 0.03, 0.27, beard, -0.08, h + 0.01, 0);                      // big beard
  addBox(hd, 0.04, 0.2, 0.27, beard, -0.155, 0.05, 0);
  addBox(hd, 0.015, 0.012, 0.07, mat('#5a3328'), -0.05, h + 0.028, 0);          // little smile

  // arms folded behind his head
  for (const s of [-1, 1]) {
    const sh = [0.42, 0.15, s * 0.19], el = [0.64, 0.28, s * 0.38], hand = [0.66, 0.18, s * 0.1];
    limb(p, sh, el, 0.12, jacket);
    limb(p, el, hand, 0.11, jacket);
    addBox(p, 0.08, 0.08, 0.08, skin, ...hand);
  }

  // one knee up, the other ankle resting on it
  const hipL = [-0.12, 0.13, 0.09], kneeL = [-0.42, 0.42, 0.09], footL = [-0.68, 0.09, 0.09];
  limb(p, hipL, kneeL, 0.15, pants);
  limb(p, kneeL, footL, 0.14, pants);
  addBox(p, 0.24, 0.1, 0.14, shoe, -0.72, 0.08, 0.09);
  const hipR = [-0.12, 0.13, -0.09], ankleR = [-0.43, 0.53, 0.2];
  const kneeR = bendPoint(hipR, ankleR, 0.42, [0, 0, -1]);
  limb(p, hipR, kneeR, 0.15, pants);
  limb(p, kneeR, ankleR, 0.14, pants);
  const foot = new THREE.Group();
  foot.position.set(...ankleR);
  p.add(foot);
  addBox(foot, 0.12, 0.24, 0.13, shoe, 0, 0.08, 0.03);

  // boombox and a couple of bin bags with his stuff
  const radio = [0.98, 0.09, 0.22];
  addBox(p, 0.34, 0.18, 0.11, mat('#2b2b30'), ...radio);
  for (const dx of [-0.09, 0.09]) addBox(p, 0.09, 0.09, 0.01, mat('#6a6a72'), radio[0] + dx, radio[1], radio[2] + 0.06, false);
  addBox(p, 0.26, 0.025, 0.03, dark, radio[0], radio[1] + 0.13, radio[2]);
  for (const dx of [-0.12, 0.12]) addBox(p, 0.025, 0.05, 0.03, dark, radio[0] + dx, radio[1] + 0.1, radio[2]);
  const bag = mat('#18181c', { roughness: 0.4 });
  addBox(p, 0.42, 0.36, 0.36, bag, 1.3, 0.18, -0.15);
  addBox(p, 0.08, 0.08, 0.08, bag, 1.3, 0.39, -0.15);

  const notes = [0, 1, 2].map(() => {
    const m = new THREE.SpriteMaterial({ map: noteTex, transparent: true, depthWrite: false });
    disposables.push(m);
    const s = new THREE.Sprite(m);
    s.scale.set(0.22, 0.22, 1);
    p.add(s);
    return s;
  });

  const offset = x * 1.7;
  return (t) => {
    t += offset;
    torso.scale.y = 1 + 0.07 * Math.sin(t * 1.4);   // slow breathing
    foot.rotation.z = 0.3 * Math.sin(t * 5.5);       // tapping to the beat
    notes.forEach((s, k) => {
      const u = (t * 0.4 + k / 3) % 1;
      s.position.set(radio[0] + 0.12 * Math.sin(u * 9 + k), radio[1] + 0.2 + u * 1.1, radio[2]);
      s.material.opacity = Math.sin(u * Math.PI);
    });
  };
}
