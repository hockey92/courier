// Looks: the gangsters' suits and the hero's skins.
import * as THREE from 'three';
import { mat } from './materials.js';

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

  // zombie night: cartoon zombies, green and scruffy, nothing gory
  zombie: {
    top: '#b9b4a2', arms: '#8fae6a', legs: '#4b4f6a', skin: '#8fae6a',
    shoes: { color: '#3a2e26' },
    // a torn office shirt and loosened tie, messy hair, glowing eyes and a dopey open mouth
    decorate(k) {
      const { head, torso, deco, h, tl } = k;
      zombieFace(k, '#3d3a2e');
      deco(head, 0.31, 0.06, 0.3, mat('#3d3a2e'), -0.01, h + 0.02, 0);                    // messy hair
      deco(head, 0.08, 0.08, 0.06, mat('#3d3a2e'), 0.02, h + 0.06, 0.08);                 // tuft sticking up
      deco(torso, 0.025, 0.2, 0.045, mat('#5a6a8a'), 0.13, tl - 0.16, 0.03);              // loose tie, askew
      deco(torso, 0.022, 0.09, 0.08, mat('#8a8470'), 0.124, -0.05, -0.07);                // dirty patch
      deco(torso, 0.022, 0.06, 0.06, mat('#8fae6a'), 0.124, -tl + 0.08, 0.08);            // a hole in the shirt
      deco(torso, 0.022, 0.05, 0.07, mat('#8a8470'), -0.124, 0.05, 0.05);                 // patch on the back
      hands(k, '#8fae6a');
    },
  },

  sprinter: {
    top: '#6a4c8a', legs: '#2f3340', skin: '#9cc07a',
    shoes: { color: '#e8e8e8', sole: '#bdbdbd', stripe: '#6a4c8a' },
    // a faded purple hoodie with the hood up and worn-out sneakers
    decorate(k) {
      const { head, torso, deco, h, tl } = k;
      const hood = mat('#5a3f78');
      zombieFace(k, '#2a2a22');
      deco(head, 0.3, 0.06, 0.32, hood, -0.02, h + 0.02, 0);                              // hood over the top
      deco(head, 0.04, 0.3, 0.32, hood, -h - 0.02, -0.02, 0);                             // and down the back
      for (const s of [-1, 1]) deco(head, 0.26, 0.28, 0.02, hood, -0.02, 0, s * (h + 0.012)); // round the sides
      deco(torso, 0.02, 0.12, 0.2, mat('#5a3f78'), 0.125, -tl + 0.12, 0);                 // front pocket
      deco(torso, 0.022, 0.07, 0.07, mat('#857a6a'), 0.124, 0.06, 0.08);                  // dirty patch
      hands(k, '#9cc07a', '#5a3f78');
    },
  },

  brute: {
    top: '#3e6a8a', arms: '#7a9a5a', legs: '#3e6a8a', skin: '#7a9a5a',
    shoes: { color: '#2a1d16', sole: '#1a120c' },
    // huge, bald and stitched together, in ripped dungarees over a bare chest
    decorate(k) {
      const { head, torso, deco, h, tl } = k;
      const stitch = mat('#2a2a22'), skinM = mat('#7a9a5a');
      zombieFace(k, '#2a2a22');
      deco(head, 0.2, 0.012, 0.012, stitch, 0, h + 0.004, 0.02);                          // stitches across the scalp
      for (const x of [-0.06, 0, 0.06]) deco(head, 0.012, 0.012, 0.05, stitch, x, h + 0.006, 0.02);
      deco(torso, 0.022, 0.14, 0.2, skinM, 0.122, tl - 0.07, 0);                          // bare chest above the bib
      for (const s of [-1, 1]) deco(torso, 0.024, 0.2, 0.04, mat('#2f5470'), 0.125, tl - 0.1, s * 0.11); // straps
      deco(torso, 0.024, 0.03, 0.03, mat('#c9a24a'), 0.127, tl - 0.2, 0.11);              // strap button
      deco(torso, 0.022, 0.08, 0.06, skinM, 0.124, -tl + 0.1, -0.06);                     // rip in the bib
      hands(k, '#7a9a5a');
    },
  },
};

// pale glowing eyes with dark rings, a brow line, ears and a dopey open mouth
export function zombieFace({ head, deco, skin, h }, brow) {
  const glow = mat('#f2f5b0', { emissive: 0x8a8a30 }), ring = mat('#5a6a40');
  for (const s of [-1, 1]) {
    deco(head, 0.016, 0.06, 0.06, ring, h + 0.003, 0.01, s * 0.06);
    deco(head, 0.02, 0.035, 0.035, glow, h + 0.006, 0.01, s * 0.06);
    deco(head, 0.02, 0.015, 0.07, mat(brow), h + 0.006, 0.055, s * 0.055);
    deco(head, 0.05, 0.07, 0.02, skin, 0, -0.005, s * (h + 0.01));
  }
  deco(head, 0.04, 0.045, 0.04, skin, h + 0.012, -0.025, 0);                              // nose
  deco(head, 0.02, 0.045, 0.08, mat('#2a1a1a'), h + 0.006, -0.085, 0);                    // open mouth
  deco(head, 0.022, 0.015, 0.025, mat('#e8e2c8'), h + 0.008, -0.068, 0.02);               // a tooth
}

export const SKINS = {
  newyorker: {
    name: 'New Yorker',
    top: '#8a8e96', legs: '#3d5a86', skin: '#e3b08a',
    shoes: { color: '#f2f2f2', sole: '#d8c7a0', stripe: '#c62a2a' },
    // NY cap, grey hoodie, jeans and sneakers
    decorate(k) {
      const { head, torso, deco, h, tl } = k;
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

  drifter: {
    name: 'Boardwalk Drifter',
    top: '#3f6b63', legs: '#4a4d53', skin: '#e8b99a',
    shoes: { color: '#1c1c1f', sole: '#a8652e' },
    // wavy shoulder-length blond hair swept back, stubble, a teal work shirt open at the collar, black
    // belt, faded grey jeans, white socks, gum-soled sneakers and an olive canvas duffel bag
    decorate(k) {
      const { r, g, head, torso, deco, skin, h, tl } = k;
      const hair = mat('#b88a4a'), streak = mat('#d4a862'), collar = mat('#38625a');
      deco(head, 0.3, 0.07, 0.3, hair, -0.01, h + 0.025, 0);                              // hair on top
      deco(head, 0.08, 0.05, 0.28, hair, h - 0.03, h + 0.04, 0);                          // swept back off the forehead
      deco(head, 0.2, 0.03, 0.01, streak, 0.01, h + 0.062, 0.01);                          // middle parting
      deco(head, 0.03, 0.34, 0.3, hair, -h - 0.01, -0.03, 0);                             // down the back to the collar
      for (const s of [-1, 1]) {
        deco(head, 0.25, 0.36, 0.045, hair, -0.015, -0.04, s * (h + 0.02));               // wavy locks over the ears
        deco(head, 0.09, 0.11, 0.04, streak, 0.05, -0.17, s * (h + 0.035));               // curling out at the jaw
      }
      deco(head, 0.03, 0.07, 0.05, streak, h + 0.006, h - 0.035, 0.085);                  // a strand fallen forward
      basicFace(k, { hair: '#9a7038', eyes: '#24343a', nose: '#d9a383' });
      deco(head, 0.02, 0.06, 0.25, mat('#c9a27a'), h + 0.002, -0.1, 0);                   // stubble
      deco(head, 0.02, 0.018, 0.09, mat('#a87a45'), h + 0.006, -0.05, 0);                 // moustache
      deco(head, 0.02, 0.022, 0.06, mat('#7a3e34'), h + 0.007, -0.078, 0);                // mouth, a little open
      // the shirt: open collar, button placket and two flapped chest pockets
      deco(torso, 0.022, 0.09, 0.07, skin, 0.122, tl - 0.045, 0);                         // open neck
      deco(torso, 0.022, 0.05, 0.035, skin, 0.122, tl - 0.11, 0);
      deco(torso, 0.04, 0.06, 0.2, collar, -0.06, tl + 0.02, 0);                          // collar behind the neck
      for (const s of [-1, 1]) {
        deco(torso, 0.12, 0.05, 0.03, collar, 0, tl + 0.015, s * 0.09);                   // collar sides
        deco(torso, 0.02, 0.06, 0.05, collar, 0.123, tl - 0.03, s * 0.065);               // collar points
        deco(torso, 0.02, 0.1, 0.085, mat('#3a645c'), 0.123, tl - 0.16, s * 0.085);       // chest pocket
        deco(torso, 0.024, 0.03, 0.09, collar, 0.125, tl - 0.115, s * 0.085);             // pocket flap
      }
      deco(torso, 0.02, 0.42, 0.025, collar, 0.122, -0.07, 0);                            // placket
      for (const y of [0.08, -0.04, -0.16]) deco(torso, 0.024, 0.018, 0.018, mat('#d8d8cf'), 0.126, y, 0); // buttons
      deco(torso, 0.25, 0.045, 0.33, mat('#151515'), 0, -tl + 0.02, 0);                   // belt
      deco(torso, 0.03, 0.035, 0.045, mat('#b8b8b8', { metalness: 0.6, roughness: 0.3 }), 0.127, -tl + 0.02, 0.03); // buckle
      hands(k, '#e8b99a', '#35605a');
      // the legs' +x faces backwards (they point down), so the faded fronts of the jeans are at -x
      const fade = mat('#53565d'), sock = mat('#f2f2ee');
      for (const thigh of [r.parts.thighL, r.parts.thighR]) deco(thigh, 0.01, 0.26, 0.13, fade, -0.08, 0.02, 0);
      for (const shin of [r.parts.shinL, r.parts.shinR]) deco(shin, 0.162, 0.06, 0.162, sock, 0, 0.14, 0);
      // olive canvas duffel, hanging from the right hand (placed in updateMeshes)
      const bag = r.bag = new THREE.Group(), olive = mat('#5b5a36'), strap = mat('#8f7a4e');
      for (const x of [-0.07, 0.07]) deco(bag, 0.025, 0.14, 0.02, strap, x, -0.06, 0);   // handles
      deco(bag, 0.34, 0.22, 0.16, olive, 0, -0.24, 0);                                    // body
      deco(bag, 0.35, 0.05, 0.165, mat('#4a4a2c'), 0, -0.33, 0);                          // bottom panel
      deco(bag, 0.3, 0.012, 0.03, mat('#2f2f1e'), 0, -0.128, 0);                          // zip
      deco(bag, 0.08, 0.06, 0.005, mat('#c9c0a6'), -0.08, -0.2, 0.082);                   // patch
      for (let i = 0; i < 6; i++) deco(bag, 0.018, 0.018, 0.005, mat('#b5b0a0', { metalness: 0.5 }), -0.1 + i * 0.04, -0.3, 0.084); // studs
      g.add(bag);
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
