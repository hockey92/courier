// The hero and the list of gangsters.
import { Ragdoll } from './ragdoll.js';
import { SKINS } from './looks.js';

export const savedSkin = localStorage.getItem('ragdollSkin');
export const man = new Ragdoll(0, 1, { hp: 6, maxHp: 6, skin: SKINS[savedSkin] ? savedSkin : 'newyorker' });

export const gangsters = [];
