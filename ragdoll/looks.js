// Looks: the gangsters' suits and the hero's skins.
import * as THREE from 'three';
import { cylGeo, mat } from './materials.js';

// ---------- Looks: the gangsters' suits and the hero's skins ----------
// eyes, brows, ears and nose; most faces start from this
export function basicFace({ head, deco, skin, h }, { hair, eyes = '#1a1a1a', nose }) {
  for (const s of [-1, 1]) {
    deco(head, 0.02, 0.035, 0.035, mat(eyes), h + 0.005, 0.01, s * 0.06);
    deco(head, 0.02, 0.015, 0.06, mat(hair), h + 0.005, 0.05, s * 0.06);
    deco(head, 0.05, 0.07, 0.02, skin, 0, -0.005, s * (h + 0.01));
  }
  deco(head, 0.04, 0.05, 0.045, mat(nose), h + 0.015, -0.02, 0);
}
export function hands({ farms, deco, fl }, handColor, cuffColor) {
  for (const fa of farms) {
    if (cuffColor) deco(fa, 0.13, 0.035, 0.13, mat(cuffColor), 0, fl - 0.0175, 0);
    deco(fa, 0.09, 0.09, 0.09, mat(handColor), 0, fl + 0.04, 0);
  }
}

export const GANGSTER_LOOK = {
  top: '#34343f', legs: '#34343f', skin: '#d9a77c', shoes: { color: '#111' },
  decorate({ head, torso, deco, h, tl }) {
    const dark = mat('#111');
    deco(head, 0.03, 0.06, 0.25, dark, h + 0.01, 0.03, 0);                                 // sunglasses
    deco(head, 0.02, 0.025, 0.1, dark, h + 0.005, -0.07, 0);                              // grim mouth
    deco(head, 0.13, 0.035, 0.035, mat('#cc9966'), h + 0.06, -0.07, 0.06);               // cigar
    deco(head, 0.02, 0.035, 0.035, mat('#ff6633', { emissive: 0xff4400 }), h + 0.13, -0.07, 0.06);
    deco(head, 0.44, 0.035, 0.44, mat('#1a1a1f'), 0, h + 0.02, 0);                        // fedora brim
    deco(head, 0.27, 0.16, 0.27, mat('#1a1a1f'), 0, h + 0.11, 0);                         // fedora crown
    deco(head, 0.275, 0.04, 0.275, mat('#7a1020'), 0, h + 0.06, 0);                       // hat band
    deco(torso, 0.02, 0.14, 0.13, mat('#eeeeee'), 0.125, tl - 0.08, 0);                   // shirt
    deco(torso, 0.025, 0.24, 0.05, mat('#b3122e'), 0.135, tl - 0.2, 0);                   // tie
  },
};

// one look per kind of gangster (see GANG_TYPES in combat.js)
export const GANGSTER_LOOKS = {
  thug: GANGSTER_LOOK,

  runner: {
    top: '#c4262e', legs: '#c4262e', skin: '#c48a62',
    shoes: { color: '#f2f2f2', sole: '#d8d8d8', stripe: '#c4262e' },
    // red tracksuit with white stripes, cap on backwards and a cheeky grin
    decorate(k) {
      const { head, torso, deco, h, tl } = k;
      const white = mat('#f4f4f4'), cap = mat('#1b1b1b');
      deco(head, 0.3, 0.1, 0.3, cap, 0, h - 0.01, 0);                                     // cap crown
      deco(head, 0.15, 0.02, 0.27, cap, -h - 0.07, h - 0.055, 0);                         // brim, backwards
      basicFace(k, { hair: '#2a1a12', nose: '#b07a55' });
      deco(head, 0.02, 0.02, 0.1, white, h + 0.006, -0.075, 0);                           // grin
      for (const s of [-1, 1]) deco(torso, 0.05, 2 * tl, 0.01, white, 0, 0, s * 0.162);  // side stripes
      deco(torso, 0.01, 2 * tl - 0.04, 0.02, mat('#d8d8d8'), 0.123, 0, 0);                // zip
      hands(k, '#c48a62', '#f4f4f4');
    },
  },

  bruiser: {
    top: '#efece2', arms: '#d9a77c', legs: '#2b3140', skin: '#d9a77c',
    shoes: { color: '#3a2a1e', sole: '#1a120c' },
    // white vest, bare arms, shaved head, a gold chain and a scowl
    decorate(k) {
      const { head, torso, deco, h, tl } = k;
      const gold = mat('#e8b923', { metalness: 0.6, roughness: 0.3, emissive: 0x3a2a00 });
      basicFace(k, { hair: '#3a2a20', nose: '#c08860' });
      deco(head, 0.02, 0.06, 0.27, mat('#a87a5a'), h + 0.002, -0.1, 0);                   // stubble
      deco(head, 0.02, 0.015, 0.08, mat('#5a2a20'), h + 0.006, -0.085, 0);                // scowl
      deco(torso, 0.02, 0.03, 0.2, gold, 0.125, tl - 0.06, 0);                            // chain
      deco(torso, 0.025, 0.05, 0.05, gold, 0.128, tl - 0.11, 0);                          // pendant
      deco(torso, 0.25, 0.06, 0.33, mat('#3a2a1e'), 0, -tl + 0.03, 0);                    // belt
      hands(k, '#d9a77c');
    },
  },

  thrower: {
    top: '#5b4636', arms: '#d9d2bf', legs: '#4a4a55', skin: '#e0ae88',
    shoes: { color: '#2a1d16' },
    // newsboy cap, waistcoat over rolled-up sleeves, and a moustache
    decorate(k) {
      const { head, torso, deco, h, tl } = k;
      const tweed = mat('#6b5a48');
      deco(head, 0.32, 0.07, 0.31, tweed, 0.01, h + 0.01, 0);                             // newsboy cap
      deco(head, 0.1, 0.02, 0.26, tweed, h + 0.04, h - 0.03, 0);                          // short brim
      deco(head, 0.04, 0.03, 0.04, tweed, 0, h + 0.055, 0);                               // button on top
      basicFace(k, { hair: '#5a3a22', nose: '#c8906a' });
      deco(head, 0.03, 0.03, 0.14, mat('#5a3a22'), h + 0.01, -0.05, 0);                   // moustache
      deco(torso, 0.022, 0.24, 0.1, mat('#d9d2bf'), 0.124, tl - 0.12, 0);                 // shirt
      for (const y of [-0.1, -0.02, 0.06]) deco(torso, 0.024, 0.02, 0.02, mat('#c9a24a'), 0.127, y, 0.06); // buttons
      hands(k, '#e0ae88');
    },
  },

  boss: {
    top: '#ece6d6', legs: '#ece6d6', skin: '#d9a07a',
    shoes: { color: '#f4f4f4', sole: '#222' },
    // Big Tony: cream pinstripe suit, black shirt, white fedora, shades, gold chain and a fat cigar
    decorate(k) {
      const { head, torso, deco, h, tl } = k;
      const dark = mat('#111'), white = mat('#f4f1ea');
      const gold = mat('#e8b923', { metalness: 0.6, roughness: 0.3, emissive: 0x3a2a00 });
      deco(head, 0.03, 0.06, 0.25, dark, h + 0.01, 0.03, 0);                              // shades
      deco(head, 0.02, 0.025, 0.1, dark, h + 0.005, -0.07, 0);                            // grim mouth
      deco(head, 0.16, 0.045, 0.045, mat('#8a5a30'), h + 0.07, -0.07, 0.05);              // cigar
      deco(head, 0.02, 0.045, 0.045, mat('#ff6633', { emissive: 0xff4400 }), h + 0.155, -0.07, 0.05);
      deco(head, 0.46, 0.035, 0.46, white, 0, h + 0.02, 0);                               // fedora brim
      deco(head, 0.28, 0.17, 0.28, white, 0, h + 0.11, 0);                                // fedora crown
      deco(head, 0.285, 0.045, 0.285, dark, 0, h + 0.06, 0);                              // hat band
      for (const z of [-0.12, -0.08, 0.08, 0.12]) deco(torso, 0.006, 2 * tl - 0.02, 0.008, mat('#a8a090'), 0.122, 0, z); // pinstripes
      deco(torso, 0.022, 0.22, 0.13, dark, 0.124, tl - 0.11, 0);                          // black shirt
      deco(torso, 0.02, 0.03, 0.12, gold, 0.128, tl - 0.05, 0);                           // chain
      deco(torso, 0.024, 0.04, 0.05, mat('#c4262e'), 0.127, tl - 0.12, -0.11);            // pocket square
      hands(k, '#d9a07a', '#f4f1ea');
    },
  },
};

export const SKINS = {
  newyorker: {
    name: 'New Yorker',
    top: '#8a8e96', legs: '#3d5a86', skin: '#e3b08a',
    shoes: { color: '#f2f2f2', sole: '#d8c7a0', stripe: '#c62a2a' },
    // NY cap, grey hoodie, jeans, sneakers and a coffee to go
    decorate(k) {
      const { r, g, head, torso, deco, skin, h, tl } = k;
      const hair = mat('#3b2a20'), cap = mat('#1d2b4f'), white = mat('#f4f4f4'), rib = '#71757d';
      deco(head, 0.3, 0.11, 0.3, cap, 0, h - 0.01, 0);                                    // cap crown
      deco(head, 0.04, 0.03, 0.04, cap, 0, h + 0.055, 0);                                 // cap button
      deco(head, 0.15, 0.02, 0.27, cap, h + 0.07, h - 0.055, 0);                          // cap brim
      deco(head, 0.01, 0.05, 0.06, white, 0.151, h - 0.005, 0);                           // NY logo
      deco(head, 0.02, 0.08, 0.29, hair, -h - 0.005, h - 0.1, 0);                         // hair under the cap
      basicFace(k, { hair: '#3b2a20', nose: '#d49c76' });
      for (const s of [-1, 1]) {
        deco(head, 0.025, 0.025, 0.02, white, 0.012, -0.015, s * (h + 0.025));            // earbuds
        deco(head, 0.04, 0.06, 0.01, hair, 0.05, 0.04, s * (h + 0.002));                  // sideburns
      }
      deco(head, 0.02, 0.07, 0.27, mat('#9c7a62'), h + 0.002, -0.1, 0);                   // stubble
      deco(head, 0.02, 0.015, 0.07, mat('#6e3b2e'), h + 0.006, -0.085, 0);                // mouth
      deco(torso, 0.12, 0.1, 0.26, mat(rib), -0.09, tl - 0.02, 0);                        // hood behind the neck
      deco(torso, 0.02, 0.14, 0.22, mat(rib), 0.125, -tl + 0.13, 0);                      // front pocket
      deco(torso, 0.25, 0.05, 0.33, mat(rib), 0, -tl + 0.025, 0);                         // waistband
      for (const zz of [-0.04, 0.04]) deco(torso, 0.015, 0.13, 0.015, white, 0.128, tl - 0.1, zz); // drawstrings
      hands(k, '#e3b08a', rib);
      // blue-and-white diner coffee cup
      const cup = r.cup = new THREE.Group();
      for (const [rt, rb, hh, color, y] of [[0.05, 0.04, 0.13, '#2c62b8', 0], [0.049, 0.047, 0.035, '#f4f4f4', 0.005], [0.054, 0.054, 0.02, '#f4f4f4', 0.075]]) {
        const c = new THREE.Mesh(cylGeo(rt, rb, hh), mat(color));
        c.position.y = y; c.castShadow = true; cup.add(c);
      }
      g.add(cup);
    },
  },

  mamdani: {
    name: 'Mamdani',
    top: '#1f2a44', legs: '#1f2a44', skin: '#b9825a',
    shoes: { color: '#1a1a1a', sole: '#2a1d16' },
    // navy suit, white shirt and tie, short dark hair, a trimmed beard and a big smile
    decorate(k) {
      const { head, torso, deco, h, tl } = k;
      const hair = mat('#16110e'), beard = mat('#2a1d16'), white = mat('#f4f4f4');
      deco(head, 0.3, 0.07, 0.3, hair, -0.005, h + 0.025, 0);                             // hair on top
      deco(head, 0.06, 0.04, 0.24, hair, h - 0.02, h + 0.045, 0.02);                      // a little lift at the front
      deco(head, 0.02, 0.15, 0.29, hair, -h - 0.005, h - 0.075, 0);                       // back of the head
      for (const s of [-1, 1]) deco(head, 0.2, 0.07, 0.02, hair, -0.04, h - 0.04, s * (h + 0.004)); // short sides
      basicFace(k, { hair: '#16110e', eyes: '#120c08', nose: '#a8714c' });
      deco(head, 0.02, 0.07, 0.27, beard, h + 0.003, -0.1, 0);                            // trimmed beard
      for (const s of [-1, 1]) deco(head, 0.2, 0.06, 0.02, beard, 0.03, -0.105, s * (h + 0.003)); // along the jaw
      deco(head, 0.02, 0.02, 0.1, beard, h + 0.006, -0.048, 0);                           // moustache
      deco(head, 0.022, 0.02, 0.1, white, h + 0.009, -0.078, 0);                          // big grin
      for (const s of [-1, 1]) deco(head, 0.022, 0.012, 0.015, white, h + 0.009, -0.066, s * 0.055); // smile turns up
      deco(torso, 0.022, 0.2, 0.13, white, 0.124, tl - 0.1, 0);                           // white shirt
      deco(torso, 0.026, 0.28, 0.045, mat('#3a5a9a'), 0.13, tl - 0.16, 0);                // blue tie
      deco(torso, 0.03, 0.04, 0.07, mat('#3a5a9a'), 0.13, tl - 0.025, 0);                 // tie knot
      for (const s of [-1, 1]) deco(torso, 0.024, 0.24, 0.035, mat('#18223a'), 0.126, tl - 0.12, s * 0.08); // lapels
      deco(torso, 0.024, 0.02, 0.02, mat('#0e1424'), 0.128, -0.05, 0.03);                 // button
      deco(torso, 0.012, 0.03, 0.05, white, 0.126, tl - 0.12, -0.12);                     // pocket square
      hands(k, '#b9825a', '#f4f4f4');
    },
  },

  worker: {
    name: 'Construction Worker',
    top: '#f07a1a', arms: '#6f737c', legs: '#3d5a86', skin: '#e0a47c',
    shoes: { color: '#8a5a2b', sole: '#3a2a1a' },
    // hard hat, hi-vis vest, work gloves and a big moustache
    decorate(k) {
      const { head, torso, deco, h, tl } = k;
      const hat = mat('#f2c230'), stripe = mat('#e6e6e6', { emissive: 0x555555 });
      deco(head, 0.31, 0.1, 0.31, hat, 0, h + 0.02, 0);                                   // hard hat
      deco(head, 0.37, 0.02, 0.37, hat, 0.01, h - 0.025, 0);                              // brim
      deco(head, 0.3, 0.03, 0.05, mat('#e0b020'), 0, h + 0.08, 0);                        // ridge
      basicFace(k, { hair: '#4a2f1f', nose: '#d0906a' });
      deco(head, 0.03, 0.035, 0.16, mat('#4a2f1f'), h + 0.01, -0.05, 0);                  // big moustache
      deco(head, 0.02, 0.015, 0.06, mat('#7a3b2e'), h + 0.005, -0.085, 0);                // mouth
      for (const y of [0.06, -0.08]) deco(torso, 0.245, 0.03, 0.325, stripe, 0, y, 0);    // reflective stripes
      for (const s of [-1, 1]) deco(torso, 0.245, 0.2, 0.03, stripe, 0, tl - 0.12, s * 0.07); // shoulder stripes
      deco(torso, 0.25, 0.06, 0.33, mat('#5a4024'), 0, -tl + 0.03, 0);                    // tool belt
      hands(k, '#c9a26b');                                                                 // work gloves
    },
  },

  classic: {
    name: 'Classic Ragdoll',
    top: '#0b0b0b', legs: '#0b0b0b', skin: '#0b0b0b',
    // the original: a black silhouette with glowing eyes
    decorate({ head, deco, h }) {
      const glow = mat('#ffffff', { emissive: 0x888888 });
      for (const zz of [-0.06, 0.06]) deco(head, 0.02, 0.05, 0.05, glow, h + 0.005, 0.03, zz);
      deco(head, 0.02, 0.035, 0.12, glow, h + 0.005, -0.06, 0);
    },
  },
};
export const SKIN_ORDER = Object.keys(SKINS);
