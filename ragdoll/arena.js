// Where the fight happens: what blocks people and what they stand on, the edges of the walkable strip, and
// where gangsters and weapon pickups turn up. It's the game's street unless another map (Brooklyn Heights)
// swaps its own in with Object.assign before anything runs.
import { Z_MAX, Z_MIN } from './config.js';
import { boxesNear, floorAt } from './world.js';

export const arena = {
  boxesNear, floorAt, zMin: Z_MIN, zMax: Z_MAX,
  inSolid: null,       // (x, y, z) => is that point inside something solid; the 3D maps' cars and bikes need it
  step: 0.03,          // the tallest ledge a ragdoll walks straight up onto
  spawnAt: null,       // () => { x, y, z } for the next gangster; null: just out of view down the street
  pickupAt: null,      // (type, block) => { x, y, z } for that block's weapon; null: a few steps into the block
  weapons: null,       // the kinds of weapon (weapons.js) lying around to pick up; null: all of them
  dropNear: null,      // (x, z) => { x, y, z }, a clear spot near there for a weapon (zombie night); null: the street
};
