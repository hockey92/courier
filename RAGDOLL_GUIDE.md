# Ragdoll Man vs the Gangsters 3D — technical and design guide

How the game (`ragdoll.html` + the modules in `ragdoll/`) is built, the patterns it follows, and how to
extend it without breaking them.
Read this before changing the game; update it when you add a system or change a convention.

---

## 1. What the game is

A low-poly 3D brawler set on a New York street at dusk. You play a ragdoll who fights his way uptown
one block at a time, past brownstones, rats, litter and a guy chilling on his cardboard. Each block has
a crew of gangsters; knock them all out and the light at the crossing turns green so you can cross to
the next. Getting hit costs hearts; losing them all means **Busted!** and the run starts again from
the first block.

### What you can do
- **Fight as the man.** Run, jump (again in mid-air to flip), punch (**F**) and kick (**G**, twice as
  hard). Knock gangsters out with punches, kicks or a stomp on the head. They fight back; you have 6
  hearts, and clearing a block gives two back.
- **Clear the street block by block.** Blocks are 48 m long and end at a crossing named after the
  next street (W 11 St, W 12 St…). The light stays red, and you can't cross, until the block's crew
  is all down. Crews get bigger, come at you more at once and swing more often the further you get.
- **Learn the gangsters.** Thugs from block 1, Runners from block 2 (one hit drops them, but they
  steal a heart and run), Bruisers from 3 (shrug off punches), Bottle Throwers from 4 (hang back and
  lob bottles), and **Big Tony** every fifth block (a boss with a health bar and a charge that leaves
  him dizzy if he runs into something).
- **Grab a weapon.** An AK-47 and a basket of apples float in the street a few steps into every block.
  Walk over one to pick it up (it swaps for whatever you're holding), then **F** or left click fires
  or throws where you aim: where the camera looks in the behind view (the rifle's laser shows where),
  at the mouse cursor in the side view. Hold it down for full auto (30 rounds) or to keep throwing (12
  apples). **E** puts it down; when it's empty it's back to fists.
- **Chase a score.** The HUD shows the block, the street you're heading for, the crew left, hearts,
  your best number of blocks cleared (saved), knockouts and the run time.
- **Change your look.** **C** or the ◀ ▶ buttons cycle the skins: New Yorker, Mamdani, Construction
  Worker, Boardwalk Drifter, Classic Ragdoll (saved).
- **Pick a camera.** **V** or the camera button switches between the over-the-shoulder behind view and
  the side-on street view (saved).
- **Play as Pizza Rat.** **R** or the "Playing:" button hands the controls to the rat dragging a pizza
  slice: scurry, hop up onto crates, bins, hydrants and taxis, and bite gangsters' ankles (**F**) to
  stagger them, all from a low rat's-eye camera. The fight pauses while you're the rat.
- **Fall into the sewer.** As the rat, scurry onto an open manhole (cover slid aside, orange cone;
  there's always one just ahead of where the rat appears). It drops into a sewer tunnel with a sludge
  channel you can paddle through, and pizza signs pointing to the lair.
- **Meet the ninja turtles.** In the lair, blue (katanas), red (sais), purple (bo staff) and orange
  (nunchucks, on the couch with pizza) stop what they're doing, greet the rat in speech bubbles, and
  cheer "Cowabunga!". Get close for more lines; bite one for a reaction.
- **Get back up.** Space at the ladder under the shaft of light climbs out next to the manhole, or the
  green "↑ Back to the street" button (top right, only shown underground) does it instantly.
  **R** returns to the man from anywhere.
- **Sound.** An original 8-bit rock 'n' roll tune plus sound effects; **M** turns it all on or off.

- **Tone:** playful, cartoony, affectionate about NYC. Nothing gory, nothing mean-spirited.
- **Look:** chunky boxes, flat shading, warm dusk light, glowing windows. Every object is built from
  simple boxes (and the odd cylinder/cone) — no imported models or images.
- **Feel:** tight, responsive controls on top of floppy, physical bodies.

## 2. Running it

The code is ES modules plus an import map (Three.js 0.160 from unpkg), so it must be served over
HTTP, not opened as `file://`:

```bash
cd /Users/I579302/cursor/test && python3 -m http.server 8765
# then open http://localhost:8765/ragdoll.html
```

There is no build step, no package.json and no Node in this environment. Textures and music are
generated in code; there are no asset files.

## 3. File layout

`ragdoll.html` is just the page: the HUD/button markup, the import map, `ragdoll/style.css` and the
entry module `ragdoll/main.js`. The code lives in `ragdoll/`, one file per topic, each starting with a
one-line description and explicit imports. Files are listed from the bottom of the dependency graph
(no imports) to the top (`main.js` imports everything it drives).

| File | What's in it | Main exports |
|---|---|---|
| `config.js` | units, body sizes, tuning constants, block size and street names, maths helpers | `S`, `GRAVITY`, `Z_MIN/Z_MAX`, `CHUNK`, `BLOCK`, `streetName`, `seeded`, `lerp`, `rot` |
| `state.js` | shared state several files read **and change** (see below), and the banner | `state`, `say`, `showFrontRow` |
| `scene.js` | renderer, scene, sky gradient, fog, camera, lights, stars | `renderer`, `scene`, `camera`, `keyLight`, `stars` |
| `materials.js` | cached boxes/colours, painted textures, apartment facades, crate/glow, box-between-points helpers | `boxGeo`, `mat`, `addBox`, `canvasTex`, `addBuilding`, `cylGeo`, `orient`, `limb`, `bendPoint` |
| `brownstones.js` | brownstone facades, stoops, railings, cornices, iron fences | `FACADE_Z`, `addBrownstone`, `fence` |
| `homeless.js` | the guy chilling on his cardboard | `buildHomeless` |
| `world.js` | chunk data (obstacles, collision boxes, house rows, manholes, crossings), chunk building, traffic signals, skyline, chunk loading | `getChunkData`, `boxesNear`, `floorAt`, `openManholeAt`, `signalMats`, `liveChunks`, `syncChunks` |
| `arena.js` | where the fight happens: the collision and edges ragdolls, gangsters, bullets, apples and bottles use, where gangsters and pickups turn up, and which weapons lie around (`weapons`, null for all). The game's street unless another map swaps itself in (§17) | `arena` |
| `waves.js` | who's in each round's crew, the kind each round introduces and its tip (shared by the street's blocks and the Heights' turfs) | `wavePlan`, `DEBUT`, `TIPS` |
| `music.js` | "Broadway Boogie" and sound effects, all synthesised | `music` |
| `effects.js` | dust puffs | `dust`, `updateDust` |
| `ragdoll.js` | skeleton and the `Ragdoll` class: controller, attacks, pose, physics, meshes | `Ragdoll`, `NAMES` |
| `looks.js` | a look per kind of gangster, and hero skins | `GANGSTER_LOOKS`, `SKINS`, `SKIN_ORDER` |
| `actors.js` | the hero and the gangster list | `man`, `gangsters` |
| `bottles.js` | the bottles throwers lob: a pool on an arc, smashing on the man, boxes or the ground | `throwBottle`, `updateBottles`, `renderBottles`, `clearBottles` |
| `turtles.js` | the four ninja turtles: box bodies, hand-made poses (idle activities, cheering) | `buildTurtle`, `applyPose`, `idlePose`, `cheerPose` |
| `sewer.js` | the sewer and the turtles' lair: geometry, collision, dropping in / climbing out, the turtles' reactions | `sewer`, `SEWER_Y`, `dropIn`, `stepTransition`, `leaveSewer`, `updateSewer`, `renderSewer` |
| `view.js` | the camera rig: side, behind and rat's-eye views, key light following | `camPos`, `updateCamera` |
| `rats.js` | AI rats and the rat you drive | `rats`, `updateRats` |
| `garbage.js` | wind and instanced litter | `updateGarbage`, `renderGarbage` |
| `traffic.js` | cars driving both ways, braking, honking, hitting people, their collision boxes | `cars`, `LANES`, `updateTraffic`, `carBoxesNear` |
| `carry.js` | picking up crates and trash cans, carrying, throwing, smashing (splinters, spilled litter) | `grab`, `updateCarry`, `renderCarry`, `flying` |
| `guns.js` | the AK-47: its box model, firing where he aims (hitscan), the laser sight, tracers, muzzle flash, brass, recoil, tossing it when empty | `buildAk`, `trace`, `updateGun`, `updateGunFx`, `renderGun` |
| `apples.js` | apples: the apple and basket models, the apple in his hand, throws, flight, bonks and splats | `buildApple`, `buildBasket`, `updateApples`, `updateAppleFx`, `renderApples` |
| `weapons.js` | the weapons list, a pickup of each on every block, taking / swapping / putting down, and handing each frame to the weapon in his hands | `WEAPONS`, `pickups`, `giveWeapon`, `putDown`, `updateWeapons`, `renderWeapons` |
| `combat.js` | kinds of gangster, spawning, their brains, Big Tony's charge, landing hits, stomps, clearing away the knocked out, getting busted | `GANG_TYPES`, `spawnGangster`, `gangsterBrain`, `resolvePunches`, `checkHits`, `hurtMan`, `updateGangs`, `renderGangs`, `behind` |
| `ui.js` | skin picker, camera switch, man/rat switch, help bar, HUD, banner, boss bar | `setSkin`, `setCamMode`, `setPlayingRat`, `updateHud` |
| `blocks.js` | the run: block waves, the red-light gate, clearing a block, busted and restarting | `wave`, `startBlock`, `holdAtGate`, `updateBlocks`, `resetRun` |
| `input.js` | held keys, one-shot actions, hotkeys | `keys`, `queued` |
| `main.js` | `update()` (the fixed-step tick), `render()`, the loop, `window.game` | — |

### Module rules
- **Import what you use, by name** (`import { mat, addBox } from './materials.js'`). Every top-level
  `const`/`let`/`function`/`class` is exported so other files can pick it up.
- **Shared mutable state goes in `state`.** An imported binding can't be reassigned by the importer, so
  values that several files *change* live on the `state` object: `camMode`, `camYaw`, `camX`, `camZ`,
  `playingRat`, `ratPlayer`, `block`, `cleared`, `crewLeft`, `gateOpen`, `bestBlocks`, `survived`,
  `knockouts`, `shake`, `caughtTimer`, `banner` (set it with `say(text, sub, frames)`), `fade` (the
  full-screen black-out, drawn by `updateHud`). Write `state.shake = 0.15`, never a separate `let shake`. One-shot key presses are
  the same idea: `queued.jump/punch/kick` in `input.js`. A `let` that only its own file changes stays
  in that file (`dustIdx`, `windT`, `squeakCooldown`).
- **No import cycles.** Lower files never import higher ones; if a low-level file needs something from
  a high one, pass it in as an argument or move the shared piece down (that's why `limb`/`orient`
  live in `materials.js`, and why `actors.js` exists separately from `ui.js`).
- **Load order is the import graph.** A file's top-level code runs after everything it imports, so
  only call other files' functions at load time if you import them. Things that need the whole game
  (like `setCamMode(state.camMode)`) run at the end of `main.js`.
- New topic → new file in `ragdoll/` with a one-line header comment; import it from whoever uses it.

## 4. Core conventions

### Units and axes
- **Metres.** `S = 0.015` converts the old 2D pixel tuning into metres; body sizes and speeds are
  written as `N * S`. New things should just use metres.
- **Axes:** `x` runs along the street (endless both ways), `y` is up, `z` crosses the street. `-z` is
  the back (houses you see in side view), `+z` is the front (towards the side-view camera).
- **Heading:** an angle `h` with forward `= (cos h, sin h)` on the x/z plane. The character's right
  is `(-sin h, cos h)`, its left side ("L" joints) is `+side` where `side = (-f.z, 0, f.x)`.
- **Walkable strip:** `Z_MIN = -4.7` to `Z_MAX = 5.6`. Anything beyond that (stoops, fences, houses)
  is scenery and needs no collision.

### Street cross-section (z)

| z | What |
|---|---|
| ≤ -6.6 | back row of houses (`FACADE_Z`) |
| -6.6 … -5.0 | stoops and areaway |
| -5.15 | iron fence (`FENCE_Z`) |
| -6.6 … -2.2 | back sidewalk (lamps at -4.6, homeless guy at -4.7) |
| -2.2 / 3.4 | curbs |
| -2.2 … 3.4 | road: westbound lane centred at -0.9, eastbound at 2.1 (`LANES`), the strip between them (0.1 … 1.1, centre line and manholes at 0.6) |
| 3.4 … 6.0 | front sidewalk |
| 6.0 … 7.6 | front row's sidewalk strip (behind view only) |
| ≥ 7.6 | front row of houses — the back row mirrored (behind view only) |

### Time
- **Fixed 60 Hz simulation.** `loop()` runs `update()` in 1/60 s steps and `render()` once per frame.
  All gameplay timers count **frames** (`stun = 25` means ~0.4 s).
- `update()` changes state; `render()` only places the camera, syncs chunks, copies state into
  meshes and draws. Purely cosmetic, time-based animation (the homeless guy, music notes) may run
  from `render()` using `performance.now()`.
- **Cooldowns are floats** (`45 + Math.random() * 45`). Always test them with `<= 0`, never `=== 0`
  — that bug once stopped gangsters from ever attacking twice.

### Randomness and determinism
- The world is generated per chunk from `seeded(i * PRIME + OFFSET)`, so a chunk looks the same
  every time it's rebuilt.
- **When adding new world content, give it its own seeded stream** (the homeless guy uses
  `seeded(i * 3571 + 99)`, the front row `seeded(i * 4441 + 7)`). Pulling extra numbers from the
  existing `rnd` would reshuffle every existing layout.
- Characters, litter, rats and effects use `Math.random()` freely.

### Geometry, materials and memory
- `boxGeo(w, h, d)`, `mat(color, extra)` and `cylGeo(...)` are **caches** — reuse them everywhere and
  never dispose what they return.
- Geometry that is unique to a chunk (building boxes with custom UVs, fences, water tanks, sprite
  materials) goes into that chunk's `disposables` array; `syncChunks` disposes them when the chunk
  is dropped.
- `addBox(group, w, h, d, material, x, y, z, cast = true)` is the workhorse. Pass `cast = false` for
  big static scenery to keep shadows cheap.
- Textures are painted at startup on canvases (`canvasTex`, `brownstoneMaterial`, sign, notes, fence).
  Lit windows use a separate emissive map so they glow at dusk.

### Code style
- Plain modern JS, no framework, no build. Short helpers over abstractions.
- Small closures returning an API (`music`) or an animate function (`buildHomeless`) are the norm.
- Comments explain *why* or name a part in a long list of boxes (`// cap brim`). Don't narrate code.
- Distances, colours and timings are inline literals with a part-name comment; promote to a named
  constant only when used in more than one place (`FACADE_Z`, `KICK_WINDUP`, `RAT_COUNT`).

### Persistence and debugging
- `localStorage` keys: `ragdollBestBlocks`, `ragdollSkin`, `ragdollCam`. Prefix new keys with `ragdoll`.
- `window.game` exposes `man, gangsters, update, render, keys, boxesNear, jump(), punch(), kick(),
  roundKick(), music, rats, setSkin, setPlayingRat, sewer, state, wave, startBlock, spawnGangster, bottles,
  giveWeapon('ak' | 'apples', ammo), pickups, paused`.
  Add new systems here so they can be driven from the console.

## 5. World

### Chunks
- The street is cut into `CHUNK = 16` m pieces. `getChunkData(i)` makes **pure data** (lamp, obstacles,
  collision boxes, building rows, homeless spot) and caches it forever; `buildChunk(i)` turns it into
  meshes. `syncChunks(camX)` keeps chunks within ±60 m of `camX` alive.
- `liveChunks` entries are `{ g, disposables, chillers, front }`:
  `chillers` are per-frame animate functions; `front` is the mirrored far-side row group.
- `buildFarChunk` makes the hazy distant skyline (`FAR_CHUNK = 160` m) and cycles the Empire State,
  Chrysler and One World Trade Center.

### Collision
- Solid things are axis-aligned boxes `{ x0, x1, z0, z1, top }` stored in chunk data.
  `boxesNear(x, range)` fetches them, plus the moving cars' boxes (`carBoxesNear`);
  `floorAt(x, z, y)` finds what you're standing on.
- Bodies are blocked from the side unless their feet are above `top`; limbs and litter are pushed out
  along the shallowest side; rats squeeze around.
- Low things (under ~1.45 m) can be hopped by gangsters; you can stand on anything.

### Adding an obstacle type
1. `obstacleBoxes(o)`: return its collision box(es).
2. `buildObstacle(g, o)`: build it from `addBox` calls at `o.x, o.z`.
3. `getChunkData`: add it to the `roll` table and choose its z range.
4. Check it doesn't land on the lamp, the homeless guy or the start (there are nudge rules for those).
5. Add its half-depth to `HALF_D` (and to `IN_ROAD` if it may stand between the lanes):
   `clearOfLanes` moves anything in the traffic lanes to the nearest sidewalk edge or the middle strip.

### Picking things up (`carry.js`)
- `PICKABLE` (world.js) lists what can be lifted (single crates and trash cans), with each one's
  hit damage and power. Each one gets its own group in its chunk (`liveChunks` entry `props`) and
  keeps its boxes in `o.boxes`. `takeObstacle(o, i)` marks it `taken` (for good: chunk data is
  cached) and removes its boxes and meshes.
- **E** (`grab`) lifts the nearest one whose side is within 0.6 m, if he's on the ground and not
  attacking. `man.holding` puts both arms overhead with the thing on his hands. He moves at 75%,
  can't punch, kick or flip, and drops it if he's hit (`stun`) or goes down.
- E again (or F) turns him to the nearest standing gangster within 10 m in front and starts the
  throw (`throwT`: 10 frames back over the head, release on frame 12, follow-through). It's lobbed at
  0.22 m/frame so it comes down on the target's chest, or straight ahead if nobody's there.
- In flight it tumbles and smashes on the first gangster (`hurtGangster` with its damage and power),
  box (crates, walls, cars) or the ground. Crates burst into splinters; trash cans lose their lid and
  fling 10 pieces of litter (`garbage`) out of the pool.

### Weapons (`weapons.js`, `guns.js`, `apples.js`)
- `WEAPONS` lists them: the AK-47 (`ak`, 30 rounds, pickup 7 m into each block) and a basket of
  apples (`apples`, 12, at 13 m). Every time `state.block` changes, each `pickups[type]` is placed at
  z = 0.6 (the middle strip, nudged along x clear of boxes) with a full load; they float, turn and
  glow. Walking within 0.7 m takes one (not while carrying a crate, not as the rat):
  `man.weapon = { type, ammo, cooldown }`. Taking the kind he already holds keeps the fuller load
  ("Reloaded!" / "More apples!"); taking the other kind puts what he held down where he stands. One
  weapon at a time, so `man.rifle` (`weapon.type === 'ak'`) is what the pose checks.
- **Aiming is by hand, no assist.** `main.js` works out `aimYaw`: the camera (`camYaw`) in the behind
  view; in the side view the cursor while the mouse is in use (`mouse.aim`, on a plane at chest height
  1.3 m so pointing at someone's body aims at him, used while the button is held or for 120 frames
  after the mouse last moved, `mouse.idle`); otherwise his heading. `aimLock` (behind view, or the
  cursor in use) keeps him facing the aim even when not firing; otherwise only while firing.
  `updateWeapons` then sets `man.heading = aimYaw` and `man.aiming`, so `control()` doesn't turn him
  the way he runs: he strafes and backs off facing his aim. On the keyboard in the side view he turns
  as he runs and shoots where he faces.
- `firing` is `queued.punch`, F held or the left button held (`mouse.fire`). **E** puts the weapon
  down 0.6 m ahead; getting knocked down drops it where he stood. Either way it keeps its ammo and
  `pickup.wait` stops him picking it straight back up until he's been 1.2 m away.

### The AK-47 (`guns.js`)
- While he holds it the punch button fires instead (`control()` drops `punch`): every `FIRE_GAP = 6`
  frames unless he's stunned. A shot is hitscan from the muzzle (`trace`), level along his heading with
  ±0.015 rad spread, stopped by any collision box it passes under the top of, or the first standing
  gangster within 0.3 m × `bulk` of the line whose body (0.1–2 m above his feet) is at the muzzle's
  height. A hit is `hurtGangster(g, 1, 0.8, …, punch = true)`, so armored kinds and a dizzy Big Tony
  take the damage without flinching. Each shot shows a 3-frame tracer, a muzzle flash with a
  `PointLight`, ejects a brass case to his right, jolts both hands back and up (recoil through the
  physics), shakes the camera a little and plays `music.bang()`.
- The **laser sight** (`laser`, `laserDot`) runs the same `trace` every frame from the muzzle and
  shows exactly where a shot would stop.
- Pulling the trigger on an empty magazine clicks (`music.dryFire()`), tosses the rifle to his right
  (`tossed`, blinks out after 100 frames) and says "Out of ammo!".
- The pose: the arms only bend in their own side planes, 0.4 m apart, so shouldering it takes three
  things together. The shoulders blade (`twist` −0.4, left shoulder forward), the right arm hangs with
  the forearm folded up to the grip (a 0.05, bend 2.1) and the left reaches forward (a 1.3, bend 0.1).
  Each arm also turns about the neck (right +0.6, left −0.1). That puts both hands 15 cm below the
  neck and 0.33 m apart on one line, and the held model is placed from the right hand towards the
  left. It eases out in the flip's tuck.

### Apples (`apples.js`)
- Holding apples, the punch is an overarm throw: `control()` sets `punchStyle = 'throw'`, `punchW` adds
  `APPLE_WIND = 5` frames, and the pose cocks the arm up with the hand behind the head (a 3.4, bend 1.3)
  before whipping it over the top (a 1.9, bend 0.1), the shoulder drawn back then driven through.
  Throws still alternate hands; holding the button keeps throwing (`main.js` passes `punch` while
  `firing`), about one every 14 frames.
- On the frame the arm is out (`punchHit`), `updateApples` takes the hit for itself (so the fist
  doesn't land) and lets an apple go from that hand along his heading at `APPLE_SPEED = 0.3` m/frame
  plus his own speed, with `APPLE_LIFT = 0.05` up: about 10 m before it comes down. `heldApple` sits
  in whichever hand throws next.
- In flight (a pool of 10) it bonks the first standing gangster it reaches (`hurtGangster(g, 1, 1, …)`,
  which staggers even bruisers, and `music.bonk()`), or splats on a box or the ground (`music.plop()`)
  into red-and-cream bits. "Out of apples!" when the last one goes.

### Traffic
- `traffic.js`: 3 cars per lane (60% taxis) loop within ±80 m of `camX`, re-entering out of sight at
  the far end. Each cruises at 0.09–0.16 m/frame and brakes (`DECEL`) for the car ahead or anyone
  whose hip is in its lane, honking (`music.honk`) at people when near the camera.
- A car still doing over 0.035 m/frame that reaches someone standing hits them (`hitByCar` in
  `combat.js`). The man loses a heart and is down for 70 frames. A gangster takes 3 damage: it
  knocks out thugs, runners and throwers, while bruisers and Big Tony go down for a moment. Each
  body has a 60-frame `carCd` between hits.
- Cars are boxes in `boxesNear`, so they block and shove people, carry anyone standing on the
  hood or roof, and catch bottles and litter. `updateTraffic` runs right after the controllers.

### Manholes
- One per chunk on the strip between the lanes (z = 0.6), from its own stream `seeded(i * 6151 + 31)`;
  ~40% are left open (cover slid aside, a traffic cone with a collision box). Chunk 0 always has an
  open one at x = 3.5, just
  ahead of where Pizza Rat appears. A manhole within 0.9 m of an obstacle box always stays closed.
- `openManholeAt(x, z)` is what the rat you play checks while it's on the ground; nothing else falls in.

### Crossings
- `BLOCK = 48` m (three chunks). Crossing `n` is at `x = n * BLOCK`, in the first chunk of the block
  (`chunkData.crossing = n`, built by `buildCrossing`): a zebra crosswalk and stop line, a signal pole
  on the back sidewalk (`x + 0.15, z = -2.55`, with a collision box), a yellow signal head lit on its
  -x face (behind view) and +z face (side view), and two green street-name blades ("W 11 ST").
- Block `n` ends at crossing `n`, named `streetName(n)` (`FIRST_STREET = 11`). The crossing adds no
  random numbers, so layouts are unchanged.
- Every signal shares `signalMats.red` / `signalMats.green`; `setSignal(go)` in `blocks.js` swaps their
  `emissiveIntensity`, so all the lights change together (the ones behind you don't matter).

### Buildings
- `makeRow(rnd, start)` fills a chunk with ~75% brownstones (5.4–6.6 m wide, ~7.6 m tall) and
  apartment blocks (8–13 m, sometimes a water tower). Leftovers under 2.5 m are absorbed so there
  are no slivers.
- **Brownstones** (`addBrownstone`): one canvas-painted facade per house (6 m × 7.6 m at 40 px/m —
  garden level, parlor floor with the door, one floor above) plus geometry for the stoop, railings,
  door hood, bracketed cornice and the fence (an alpha-tested plane with tiling UVs). Facade
  materials are cached by `stone | doorLeft | litSeed`.
- The far-side row reuses `buildRow` on a group rotated 180° and shifted by `FRONT_ROW_SHIFT`; it's
  hidden in side view because it would stand between the camera and the street.
- Keep houses around 7–8 m: taller ones hide the sky and skyline in side view.

## 6. Characters

### The `Ragdoll` class
One class for the hero and gangsters. Behaviour differences come from options passed to the
constructor (`style`, `speed`, `accel`, `canFlip`, `windup`, `kickWindup`, `hp`, `skin`...), not
subclasses.

Three layers, kept separate on purpose:
1. **Controller** — `control(ix, iz, jump, punch, kick)`: position/velocity, ground check, jumping and
   the double-jump flip, obstacle blocking, attack timers, stun. This is what makes controls tight.
2. **Pose** — `pose()`: where each of the 11 joints *should* be this frame, worked out in the body's
   side-on plane (x forward, y down) and placed in the world by heading. Run cycle, idle breathing,
   flip tuck, punches and kicks are all blended here.
3. **Physics** — `step()`: Verlet points pulled toward the pose by `stiffness`, then 6 passes of stick
   constraints, ground friction and obstacle push-out. See "The physics, briefly" below.

`updateMeshes()` (called from `render`) stretches a box between joint pairs with `orient()`.

Where a ragdoll lives comes from its `world` option: `{ boxesNear, floorAt, zMin, zMax, step }`
(`step` is the tallest ledge it walks straight up onto). It defaults to `arena` (`arena.js`): the game's
street, unless a map has swapped its own in, as Brooklyn Heights does (§17). Combat, the gun, apples, bottles
and weapon pickups use `arena` too, so the whole game runs on whichever map it is. `montague.js` passes its
own world so the hero can walk Montague St (§16). `boxesNear` is called as `boxesNear(x, range, z)`; the
game's and Montague's ignore the `z`, Brooklyn Heights uses it to look boxes up in a grid. A box may also
have a `bottom`: it's then a deck that bodies and limbs pass under when they're below it (footbridges, the
Brooklyn Bridge's walkway). A ragdoll created with a `y` option starts at that height.

### Attacks
- `Ragdoll.swing(t, windup, hold, back)` turns an attack timer into `[wind, ext]` amounts (0…1):
  wind up → 4 frames out → hold → pull back. Punches (`punchT`, hold 4, back 8) alternate
  hands and kicks (`kickT`, hold 6, back 10) alternate legs: each new blow flips `punchSide` /
  `kickSide`, and `punchHand` / `kickFoot` name the limb that lands it. Kicks go head-high.
  While fighting (and 45 frames after) the fists come up to a `guard` by the chin; punches drive out
  from the guard while the shoulders `twist` into them (arm points turn about the neck in `pose()`,
  the torso and shoulder ends turn with them in `updateMeshes()`).
- Every third punch (`punches % 3`) is a spinning backfist (`punchStyle = 'back'`), still on
  alternating hands. `punchW` adds `BACKFIST_SPIN = 12` frames of wind-up, and `backfistSpin()`
  turns the body a full circle *towards the striking hand* over the wind-up and strike, speeding up
  all the way (the same `spin` the round kick uses). While he turns, the twist winds the shoulders
  0.9 rad the other way, carrying the bent arm across so the fist cocks by the far side of the chin.
  Over the last 4 frames they unwind to −0.25 as the arm snaps straight, and the back of the fist
  lands in front of him at head height as the turn completes. The hero's backfist has `minDot` −0.1
  (it also catches someone level with his shoulder) and power 1.3.
- Round kicks (spinning, **H**, the man only): `control(..., kick = 'round')` sets `kickStyle`;
  `kickW` adds 4 frames of wind-up. `roundPose()` scripts it in the kicking leg's own frame: a small
  counter-turn, then `spin` turns the body a full circle *towards the kicking leg* over
  `ROUND_SPIN = 20` frames. It speeds up all the way, so the kick lands at full speed. The leg stays
  tucked for the first third, then unfolds, and its `sweep` about the hip goes from 0.9 rad out to its
  side to straight ahead. So the foot swings round behind him and across, and lands in front at
  chest height as the turn completes. The follow-through carries it on out to its side as it drops,
  and the upper body `tilt`s away throughout. `spin` is added to the heading only for drawing
  (`faceDir` in `pose()` / `updateMeshes()`); `fwd` and movement ignore it, and the pose is followed
  at stiffness 0.7 while spinning. The hit lands 1 frame before the turn completes: reach 1.4 m,
  `minDot` −0.3 (the sweep also catches anyone to the side), power 2.4.
- The blow lands on the frame `t === windup + 4`: `control()` sets `punchHit` / `kickHit`, and the
  game resolves it in `resolvePunches()` through `landHit(attacker, flag, reach, vReach, limbEnd,
  targets, onHit, minDot)`. The class never needs to know who it's fighting.
- Attacks step the attacker forward (punch +0.035, kick +0.06) so combos stay in range despite
  knockback. If you change knockback, re-test that three punches / two kicks still connect.
- Starting a flip, getting staggered or knocked out calls `cancelAttacks()`.

### Taking hits
- `stagger(dx, dz, power)`: knockback, a head/neck snap (by moving the points' previous positions),
  a lean back in `pose()`, and `stun = 15 + 10 * power` frames of no input. `power` is divided by
  `mass`, so heavy gangsters are knocked about less.
- `knockOut(dx, dz, frames, power)`: stiffness to 0 so the body goes limp, plus an impulse (divided
  by `√mass`). When `knocked` counts down, `getUp()` restores control, stiffness ramps back and `hp`
  refills. Gangsters and the busted man are knocked out for `1e9` frames, so they never get up on
  their own.
- Invulnerability `invuln` makes the body blink: 30 frames after a hit, 90 after getting up.
- Every hit on the man goes through `hurtMan(damage, power, nx, nz)` (blows, bottles, the charge);
  every hit on a gangster through `hurtGangster`, and knockouts through `downGangster`, which counts the
  KO, gives back a stolen heart and sets `leaveT = 170`. `updateGangs` blinks him for the last 60 frames
  and then removes him from the scene and from `gangsters`.

### Kinds of gangster (`GANG_TYPES` in `combat.js`, looks in `GANGSTER_LOOKS`)
`spawnGangster(type, extraHp, aggro)` builds a `Ragdoll` from the kind's numbers; `g.type` and `g.kind`
say what he is. `mass` and `bulk` (mesh width, via `scale` on each part) come from the kind.

| Kind | HP | Speed | Wind-ups (punch/kick) | Damage (punch/kick) | What's special |
|---|---|---|---|---|---|
| Thug | 3 | 4.8 S | 20 / 16 | 1 / 2 | the regular; 40% kicks |
| Runner | 1 | 6.6 S | 12 / 12 | 1 / 1 | backs off after every swing; landing a hit steals a heart (`stolen`, heart over his head) and he runs for 240 frames; knocking him out gives it back |
| Bruiser | 6 | 3.6 S | 26 / 22 | 2 / 2 | `armored`: punches hurt but don't stagger him; `mass` 1.8, `bulk` 1.4 |
| Bottle Thrower | 2 | 4.4 S | 18 / 16 | bottle 1 / kick 2 | stands off 4.5–7.5 m and throws every 90–160 frames (a punch that releases a bottle in `resolvePunches`); kicks if you get within 1.6 m |
| Big Tony (boss) | 14 (+4 per visit) | 4.2 S | 28 / 22 | 2 / 3, charge 3 | `armored`, `mass` 2.6, `bulk` 1.65; the charge (below); a stomp does 3 damage instead of a knockout (45-frame cooldown) |

**Big Tony's charge** (`chargeBrain`): when his cooldown is up and you're 3–11 m away, he paws the
ground for `CHARGE_WINDUP = 50` frames lining up on you (dust at his heels), then runs straight at 2.6×
speed for up to `CHARGE_TIME = 80` frames. Touching you costs 3 hearts. If he runs into an obstacle or
the edge of the street he's `dizzy` (stun 130, stars round his head): punches and kicks hurt without
waking him. A kick during the wind-up staggers him out of it.

### Current combat numbers

| | Hero | Gangsters |
|---|---|---|
| Health | 6 hearts, +2 for each block cleared | see the table above |
| Punch | wind-up 3, 1 damage, reach 1.0 m | reach 1.0 m |
| Kick | wind-up 6 (`KICK_WINDUP`), 2 damage, reach 1.2 m, vertical reach 1.7 m (flying kicks) | reach 1.2 m |
| Round kick | wind-up 10, spin 20, 2 damage, power 2.4, reach 1.4 m in front and to the sides | — |
| Stomp | landing 1.25–1.95 m above a gangster's feet knocks him out (Big Tony: 3 damage) | — |
| AK-47 | 30 rounds, 10 a second, 1 damage, power 0.8 (no flinch for armored kinds), range 30 m | — |
| Apples | 12, about 4 a second, 1 damage, power 1 (staggers everyone), about 10 m | — |
| Between attacks | — | `gap`–2×`gap` frames divided by `aggro` (1 + 0.05 per block); picks next move ahead |

The man's knockback from a gangster's hit is multiplied by `√mass`. `behind()` spawns gangsters just
out of view: behind the hero in side view, ahead up the street in behind view. Stragglers over 34 m away
are re-placed the same way.

### Gangster AI (`gangsterBrain`)
Returns the same inputs a player gives: `[ix, iz, jump, punch, kick]`. Approach to arm's length (or
back off while `flee > 0`, or stand off at range for throwers), spread out from each other, slide around
tall obstacles, hop low ones, track the hero during the wind-up but commit once the blow is on its way
(so sidestepping works), and stand around when he's down. Big Tony hands over to `chargeBrain` while
`g.charge` is set. New enemy behaviour should keep going through `control()` this way.

## 6b. Blocks and the run (`blocks.js`)

- `wavePlan(n)` decides block `n`'s crew: `3 + n` gangsters (at most 12), drawn from the kinds
  unlocked so far (runners from 2, bruisers from 3, throwers from 4), with up to `2 + n / 3` (at most 4)
  standing at once. The kind a block introduces (`DEBUT`) is always in its first two, and its tip
  (`TIPS`) shows in the "Block n" banner. Every fifth block is Big Tony plus one thug per visit, two at
  once, and plays `music.alarm()`.
- `updateBlocks()` spawns from `wave.queue` every 50–110 frames while fewer than `wave.max` are
  standing, keeps `state.crewLeft` up to date, and calls `blockCleared()` when it hits 0: the light
  goes green, `state.cleared` and the saved best go up, +2 hearts, `music.cheer()`. Walking 3 m past the
  crossing starts the next block.
- `holdAtGate()` runs straight after `man.control()`: while the light is red he can't get past
  `gateX(block) - 0.35`, and bumping into it says "Don't walk!" (at most every 240 frames).
- **Busted** (`getBusted`): the man stays down, `caughtTimer = 210` shows the "Busted!" banner, the
  screen fades out over the last 40 frames and `resetRun()` puts him back at x = 0 with full hearts,
  clears every gangster and bottle and starts block 1. `updateBlocks` runs after `updateSewer` because
  the sewer also eases `state.fade`.
- Nothing spawns and the gate is ignored while you're playing the rat.

### The physics, briefly
Verlet integration (velocity = position − previous position, 1% damping), 11 points, 11 sticks
including a weak head-to-hip stick that stands in for a spine limit. Hits are impulses made by
shifting previous positions. No joint limits or self-collision; limbs can't twist. That's the
trade-off for something tiny, stable and easy to blend with animation.

## 7. Looks and skins

- Every entry in `GANGSTER_LOOKS` (one per kind; `GANGSTER_LOOK` is the thug's) and in `SKINS` share
  one shape (a gangster's `Ragdoll` gets its look through the `look` option):

```js
mySkin: {
  name: 'Shown in the picker',
  top: '#hex', arms: '#hex' /* optional, defaults to top */, legs: '#hex', skin: '#hex',
  shoes: { color: '#hex', sole: '#hex', stripe: '#hex' }, // optional, each field optional
  decorate(k) { /* add boxes to k.head, k.torso, k.farms; may set k.r.cup */ },
},
```

- `decorate` gets a kit: `r` (the ragdoll), `g` (its group), `head`, `torso`, `farms` (forearms),
  `deco(parent, w, h, d, material, x, y, z)`, `skin` (material), and the half sizes `h` (head),
  `tl` (torso), `fl` (forearm).
- **Local axes on body parts:** +x is the front (face, chest), +y runs up the part (top of head,
  shoulders, hand end of the forearm), z is sideways. The face is the plane `x = h`; put features at
  `h + 0.005` so they sit on it. `basicFace()` and `hands()` cover the usual eyes/brows/ears/nose and
  hands with cuffs.
- Order matters only for the picker: `SKIN_ORDER = Object.keys(SKINS)`. Adding an entry is enough to
  make it selectable (◀ ▶ buttons or **C**); the choice is saved.
- Props that need to follow a joint without rotating with it are placed in `updateMeshes()`; set them
  in `decorate` and handle them there. `r.cup` (the New Yorker's coffee, left hand) and `r.bag` (the
  Boardwalk Drifter's duffel, hanging just outside the right hand, hidden while he holds the rifle or
  a crate) are the two so far.
- Legs point down, so on thighs and shins `+x` is the *back*; put things on the front of the jeans at
  `-x` (`r.parts.thighL` etc. are already built when `decorate` runs).
- Likenesses of real people stay respectful, cartoonish and "a bit like" — no caricatured features.

## 8. Cameras and controls

`setCamMode('behind' | 'side')` is the single switch. It saves the choice, sets fog (20–75 m behind,
35–260 m side), field of view (62° / 50°), shows or hides every chunk's `front` row, and rewrites the
help bar from `HELP_MOVE[mode]` + `HELP_REST`.

| Key | Behind view | Side view |
|---|---|---|
| ← → / A D | turn (0.045 rad/frame) | run along the street |
| ↑ ↓ / W S | run forward / back | move across the street |
| Space | jump, again in the air to flip | same |
| F / G / H | punch / kick / round kick (auto-turns to the nearest gangster) | same |
| E | pick up the crate or trash can you're next to; E again (or F) throws it; with a weapon, puts it down | same |
| F held / left button held | with the AK-47 full auto, with apples one throw after another, where the camera looks (the laser shows where shots go) | at the mouse cursor while you're using the mouse, otherwise where he faces |
| Mouse | the first click grabs the mouse (pointer lock, Esc lets go); moving it left/right turns him and the camera (`mouse.turn`, 0.0035 rad per pixel). Clicks attack where he faces: left click punch (or throw what he's holding), right click kick, middle or Shift+left click round kick | the mouse stays free; the same clicks turn him to face the spot clicked, then to the nearest gangster in reach within 60° of it |
| C / V / M | next skin / switch camera / sound on-off | same |
| R | play as Pizza Rat (see below) / back to the man | same |

In behind view the camera sits 5 m behind and 2.8 m up, eases with `lerp(0.15)`, is clamped out of the
houses, and `camX` runs 15 m ahead so chunks, litter and rats are ready in front of you.
Anything that spawns "out of view" must respect the camera mode.

### Rat mode
`setPlayingRat(on)` (**R** or the "Playing:" button) hands the controls to Pizza Rat (`rats[0]`, held in
`ratPlayer`). It overrides the camera without touching `camMode`: a low rat's-eye chase cam (1.3 m
behind, 0.45 m up, 72° FOV, fog 10–50 m, both house rows shown, kept inside the fences). Leaving calls
`setCamMode(camMode)` to restore everything.

- Controls: ← → turn, ↑ scurry (0.075 m/frame), ↓ back up, Space hop (~0.85 m: crates, bins,
  hydrants, the homeless guy, taxi bonnets), F bite (staggers a gangster within ~0.5 m of the snout,
  30-frame cooldown). `update()` packs the keys into `ratPlayer.input`; `driveRat()` moves it;
  `animateRat()` is shared with the AI rats.
- While you're a rat the man stands still, `gangsterBrain` returns no input, nothing spawns, bottles
  hang in the air, the gate is ignored and the run timer is paused, so it's a free-roam mode. Gangsters' wind-ups are cancelled on switching.
- `showFrontRow()` decides whether the far-side row is visible (rat mode or behind view); new chunks
  use it too.

### The sewer and the turtles
Scurry over an open manhole and the rat drops in (`dropIn`: a hop, a slide-whistle, the camera peers
down the hole while `state.fade` blacks out). `enterSewer` then moves the one sewer group (built once at
load) under that manhole, at `SEWER_Y = -20`, and drops the rat down the shaft.

- **Coordinates:** sewer x is relative to the manhole (`sewer.ox`), z is the street's z, y relative to
  `SEWER_Y`. The tunnel runs from `WEST` (-14) to `LAIR_X` (10), ±3.05 m wide, with a sludge channel
  (±1 m, floor at -0.42) down the middle; the lair room is ±5.05 m from 10 to `EAST` (22). The shaft and
  ladder are at x = 0 by the back wall.
- **Collision:** `SOLIDS` (walkways and lair floor with top 0, walls with top 99, furniture) become
  `sewer.boxes` in world coordinates on entry, plus one live box per turtle. `driveRat` uses them instead
  of `boxesNear`, and the floor defaults to the channel bed, so the rat can drop into the sludge
  (half speed) and hop back out.
- **Mood:** `setSewerMood(on)` swaps fog, background, hemisphere/key/rim light levels and the lair
  bulb. The bulb `PointLight` lives in the scene with intensity 0 rather than being added and removed,
  because changing the number of lights recompiles every shader. Walls don't cast shadows, so the
  key light (moved down to `SEWER_Y` by `view.js`) lights the room through the ceiling.
- **Camera:** `sewerClamp` keeps it inside the walls; in the lair `ratLift` pulls it back and up so
  the turtles and their bubbles fit. A camera target more than 5 m away (dropping in, climbing out) is
  a cut, not an ease.
- **Turtles** (`turtles.js`): blue (katanas, kata on a training mat), red (sais, working the punching
  bag), purple (bo staff twirl) and orange (nunchucks, on the couch with pizza). A pose is 16 numbers
  (see `applyPose`); `renderSewer` blends `idlePose` and `cheerPose` by `ex`, which `updateSewer`
  eases towards 1 while the rat is within 2.4 m or during the greeting's cheer. Heads track the rat
  in the lair.
- **Talking:** `GREETING` is a little script run on frames since the rat reached the lair (the last
  line sets everyone cheering and plays `music.cheer()`); after that each turtle says one of its
  `lines` when the rat comes within 1.5 m, and biting one (`biteTurtle`) gets a `BITE_LINES` reply.
  Bubbles are canvas textures cached per text.
- **Leaving:** Space at the ladder (`atLadder`) climbs out to beside the manhole. The green
  "↑ Back to the street" button (`#streetBtn`, shown by `updateHud` only while the rat is down the hole
  or in the sewer) and switching back to the man both call `leaveSewer`, which does the same instantly.

## 9. Ambient life

- **Litter** (`GARBAGE_TYPES`): one `InstancedMesh` per type (55 pieces in total), blown by a gusty
  wind, kicked up by anyone running through, wrapped around `camX` within ±32 m. Adjust `count` for
  density.
- **Rats** (`RAT_COUNT = 9` within ±20 m of `camX`): states `idle` (sniff), `wander` (scurry along the
  street) and `flee` (anyone within 1.8 m), preferring `RAT_LANES` by the fence and curbs. Rat 0 is
  Pizza Rat, and the one you play in rat mode (it skips the AI and wrapping while `ratPlayer` is set).
  Fleeing squeaks, at most every 20 frames and only near the camera.
- **The guy chilling** (`buildHomeless`): always one at x = 3, then in ~35% of chunks, against the
  fence. Returns an animate function (breathing, foot tapping, music notes) stored in `chillers`.
- **Dust**: an 80-mesh pool, `dust(x, y, z, n)` for landings, hits and stomps.

Pattern for new ambient things: a pool or a fixed-size array that wraps around `camX`, simulation in
`update()`, and nothing that costs per-frame allocations.

## 10. Audio

- `music` is a closure with its own `AudioContext`, created on the first key press or click
  (browsers block autoplay). **M** fades the master gain, which also mutes sound effects.
- Sequencer: 16th-note steps, a 25 ms `setInterval` scheduling ~150 ms ahead, light swing, and a guard
  that skips ahead if the tab was asleep.
- Instruments are `voice(wave, freq, t, dur, vol, { pluck, vibrato, bend, dest })`: a 25% pulse lead
  (NES-style), triangle bass, sawtooth rhythm guitar through a fuzz bus (soft clip → low-pass →
  `level` 0.15, because the clipper adds a lot of gain), noise-based hats/snare/crash, a sine kick.
- Current song: **"Broadway Boogie"**, an original 24-bar rock 'n' roll tune (12-bar blues in A twice:
  riff, then solo) at 165 BPM. The lead is written as one string per bar:
  - 8 or 16 slots per bar (eighths or sixteenths)
  - notes like `C5`, `F#5`, `Eb5`; `+` joins notes into a double-stop; `~` bends up into the note
  - `-` holds the previous note, `.` is a rest
- **Only original music.** Write new tunes "in the style of"; don't transcribe copyrighted melodies,
  riffs or lyrics.
- Sound effects go through the same `out` node (see `squeak()`, and `blip()` behind `fall()`, `plop()`
  and `cheer()`); add new ones to the returned API.

## 11. HUD and UI

- Top-left: block, "Heading for W 11th St", hearts (♥/♡ from `man.hp`), crew left (or "Green light"),
  best blocks / KOs / time. Top-right: skin picker, camera button, "Playing:" (man/rat) button, and the
  green "↑ Back to the street" button while the rat is underground. Centre: the banner (`state.banner`,
  set with `say()`; fades over its last 20 frames). Bottom: Big Tony's health bar while he's standing,
  and the help bar (rewritten for the man, the rat and the sewer). Between the 3D view and the HUD:
  `#fade`, the black-out for the manhole transitions and the restart after getting busted.
- Overlay buttons must call `e.preventDefault()` on `mousedown` so they never keep focus — otherwise
  the next Space press would click them.
- Style: white text with dark shadow, translucent `#0006` pills, `system-ui`.

## 12. Art direction cheat sheet

- **Sky:** gradient `#141a3d → #4a3570 → #c86a72 → #f7b56c`; fog `0xe0857a`; stars above.
- **Street:** sidewalks `#8a8798`, road `#2b2a33`, yellow centre line `#e8c547`.
- **Brownstone stone:** `#6e4535` / `#7c4b36` / `#5b3b30`; cream window frames `#e9e1cf`; lit glass
  `#ffd88a`; cornices `#2e2622`; iron `#141414`.
- **NYC props:** yellow taxis, green dumpsters, red hydrants, water towers, diner coffee cups,
  pizza, bodega-style details. Prefer recognisable NYC things when adding content.
- Proportions: the hero is ~1.8 m; keep props to real-world size so the scale reads.

## 13. Testing recipes

There's no test suite; verify in the browser.

- **Console driving:** `game.paused = true`, then call `game.update()` in a loop for frame-exact
  scenarios; `game.punch()`, `game.kick()`, `game.jump()`, `game.keys.ArrowRight = true`.
- **Placing a ragdoll** — move all its points with it, or it snaps back:

```js
const place = (g, x, z) => { const sx = x - g.x, sz = z - g.z; g.x = x; g.z = z;
  for (const q of Object.values(g.pts)) { q.x += sx; q.px += sx; q.z += sz; q.pz += sz; } };
```

- **Combat checks after any tuning:** an idle hero gets hit by both punches and kicks; 3 punches, 2
  kicks, and punch + kick each knock out a thug (their `accel` differs, test several);
  hitting a gangster during his wind-up cancels it; flying kicks land at low and mid jump height.
- **Kind checks:** `game.spawnGangster('runner' | 'bruiser' | 'thrower' | 'boss')`, then place him.
  A runner that lands a hit has `stolen` set and the heart comes back when he's knocked out; a punch
  leaves a bruiser's `stun` at 0 but a kick doesn't; a thrower 6 m away hits an idle man with a bottle
  within ~60 frames; Big Tony's charge hits an idle man after ~75 frames, and goes `dizzy` at the street
  edge if the man moves out of the way after the wind-up.
- **Skipping ahead:** `game.wave.queue = []`, mark the gangsters gone (`g.leaveT = 1`) and step a few
  frames to clear a block; move the man past the crossing, or call `game.startBlock(n)`.
- **Looking closely:** pause, `render()`, then zoom with
  `canvas.style.transformOrigin = 'Xpx Ypx'; canvas.style.transform = 'scale(5)'` and screenshot.
  Reset the transform afterwards.
- **Audio levels:** temporarily wrap `AudioNode.prototype.connect` to find the master gain (the
  most-connected `GainNode`), attach an `AnalyserNode` and read peak/RMS. Target peak ≈ 0.5, no
  samples at full scale.
- Watch the console for errors after every reload. A syntax error or a bad import in any file stops
  the whole game from starting; a missing import only fails when that line runs
  (`ReferenceError: x is not defined`), so exercise the code you touched.

## 14. Known limitations and ideas

- Ragdolls have no joint limits or self/character collision; limbs pass through each other.
- Gangster punches have no hit reaction animation beyond the stagger; no blocking or dodging moves.
- Only one song; few per-event sound effects (rat squeak, manhole fall, landing plop, turtle cheer).
- The manhole hole is an opaque disc, so the rat vanishes into it rather than visibly sinking; only the
  rat you play can fall in.
- The far-side row only exists in behind view; side view relies on the camera never turning round.
- All the traffic signals share materials, so the lights behind you change too.
- Ideas that fit the existing patterns: more skins, a subway entrance or bodega obstacle, pigeons
  (rats' state machine), a second song that switches when the hearts run low, pickups (a slice that
  restores a heart), a block-the-blow move driven through `control()`, Pizza Rat delivering slices to
  the turtles to call one up as backup, a combo meter, grabbing and throwing knocked-out gangsters.

## 15. Checklist for changes

1. Put code in the right file (or a new one); import what you use, keep shared changing values on
   `state`, no import cycles.
2. Metres, frames, heading conventions; float cooldowns tested with `<= 0`.
3. New world content: its own seeded stream, collision boxes if walkable, `disposables` for unique
   geometry, `addBox(..., false)` for static scenery.
4. New behaviour through `control()` inputs and the existing attack/hit flow.
5. Keep `update()` for state and `render()` for visuals.
6. Expose new systems on `window.game`; prefix storage keys with `ragdoll`.
7. Update the help text (`HELP_MOVE` / `HELP_REST`) for new controls.
8. Reload, check the console, verify visually and with a scripted scenario.
9. Update this guide.

## 16. Montague St (`montague.html`, `ragdoll/montague.js`)

A separate page, not part of the game: Montague St by Borough Hall in Brooklyn, rebuilt from a Street View
photo with the game's helpers (`scene.js`, `addBox`, `mat`, `canvasTex`, `limb`), relit as an overcast day.
The game's hero walks it in his saved skin.

- Same axes as the game, with the photo looking along +x. Road z -4.5 … 4.5, left sidewalk out to the
  facades at -10, right sidewalk to the building-site fence at 8.7; sidewalks are 0.15 m up.
- `block()` builds a building with a tiled facade (one bay × one floor per tile) and adds its collision
  box; everything else solid calls `solid()` / `around()`. Its `floorAt` lets him step up `STEP = 0.2` m,
  so he walks up the curbs.
- Importing `ragdoll.js` brings in `world.js`, `traffic.js` and `music.js`. The page removes the game's
  traffic from the scene and starts with the music off (**M** turns it on).
- Cameras: `walk` (over the shoulder, like the behind view) and `look` (free, Street View style; **R**
  goes back to the photo's viewpoint); **V** switches. `window.street` exposes `hero`, `tick`, `boxes`,
  `setMode` and `resetView`.

## 17. Brooklyn Heights (`heights.html`, `ragdoll/heights*.js`, `ragdoll/batch.js`)

Another separate page: the stretch of Brooklyn circled on a map, from the Brooklyn Bridge and Old Fulton St
down to Atlantic Ave, and from Brooklyn Bridge Park's piers across to Cadman Plaza and Borough Hall, at
roughly real scale (about 1.2 × 1.4 km). Sunny late afternoon in October. The game itself is played on it:
the game's hero (`actors.man`), gangsters, weapons and bottles, in a run from turf to turf.

- **Axes:** the map is turned to the Heights' street grid: `x` runs grid-east (towards Cadman Plaza), `z`
  grid-south (towards Atlantic Ave); the grid is tilted `GRID_TILT` = 21° from true north, which only the
  minimap uses. Streets run exactly along x or z.
- **Levels:** the Heights stand on a plateau at `TOP = 16`, sidewalks `CURB = 0.15` above; the waterfront
  (Furman St, the park, the piers) is at `WF = 2`. The ragdoll's limbs can't go below 0, so everything
  stands on boxes rather than dipping under the ground. Old Fulton St, Joralemon St and Atlantic Ave run down
  the bluff (`DESCENTS`) as slopes you see and `STEP = 0.2` stairs you walk; the Squibb Park footbridge and
  the Brooklyn Bridge's walkway are stairs of decks (boxes with a `bottom`). The world lets him climb
  `CLIMB = 0.25`, a little more than a stair, so rounding never stops him.
- **`heightsmap.js`** is plain data, shared by the 3D page and the minimap: `NS` / `EW` streets (centre,
  half-width `r`, extent — every street starts and ends on another street or the edge), `CELLS` (the
  blocks between every street line, each with a sidewalk slab out to its curbs, building lots inside, the
  streets it fronts and a `kind`: `rows`, `downtown`, `dumbo`, `cadman`, `courts`, `borough`, `squibb`,
  `watchtower`, `bridge`), the bluff (`PROMENADE`, `BQE`), the waterfront (`UPLAND`, `LANDING`, `PIERS`,
  `FURMAN`), the bridge (`BRIDGE`, `bridgeY(x)`), landmark footprints and `PLOTS` (churches and towers that
  take over part of a block). Neighbouring cells with no street between them have slabs that meet.
- **`heightsworld.js`** builds it all and owns the collision. `solid()` files small boxes in an 8 m grid and
  keeps big ones (slabs, piers, the river) in a list; `boxesNear(x, range, z)`, `floorAt`, `inSolid`, and
  `movers` (the street cars' live boxes). Blocks fill with rows of houses along each street they front:
  `streetStyle` picks what a street gets (shops on Montague St and Atlantic Ave, offices on Court St, towers
  on Cadman Plaza W, warehouses on Old Fulton St, otherwise a mix of brownstones, brick, painted and frame
  rowhouses and the odd prewar apartment block), runs of the same style stick together, and each house gets
  a cornice, a stoop with walkable steps and an areaway fence, or a door and canopy. The river is solid up to
  `WF + 8` everywhere but the land, so nobody walks into it; the bridge walkway passes high above.
- **`batch.js`** merges everything static: `Batch.box/prism/poly/geometry` collect faces per material and
  per 300 m patch (so patches out of view are culled) and `finish()` makes one mesh each; walls use tiled
  facade textures (one bay × one floor per tile, `tw` / `th` in metres). Plain-coloured parts share one
  vertex-coloured material. Trees, lamps, lanterns, parked cars and hydrants are `instanced()`.
  Materials with `userData.cast = false` (ground, far scenery) skip the shadow pass.
- **`heights.js`** is the page. At the top it swaps the map into the game with `Object.assign(arena, HEIGHTS)`
  (and `arena.spawnAt` / `arena.pickupAt` from the run), so `combat.js`, `guns.js`, `apples.js`,
  `bottles.js` and `weapons.js` all work here unchanged. Its `tick()` follows `main.js`'s `update()`: a
  weapon fires or throws while **F** is held, aimed where the camera looks (`aimLock`, as in the behind
  view); punches and kicks turn him to the nearest gangster in reach; then the gangsters' brains, hits,
  stomps, steps, `updateGangs` and the run. It also has the light (the shadow box follows the hero),
  traffic in `LANES` (one-way strips along x or z; street lanes stop for anyone in them and have collision
  boxes, the BQE's two decks and the bridge's roadways don't), people walking the sidewalks, the
  Promenade, the park and the bridge (hidden beyond 160 m), the cameras (the walk camera is pulled in front
  of walls and roofs, and shakes with `state.shake`), the street name of where he is, and `PLACES` for the
  number keys. `window.heights` exposes `hero`, `tick`, `goTo`, `setMode`, `yaw` (where he looks and aims),
  `traffic`, `walkers`, `PLACES`, `mini`, `game`, `gangsters` and `state`.
- **`heightsrun.js`** is the run, the Heights' version of `blocks.js`: `TURFS` (the Promenade, Montague
  St, Columbus Park, Cadman Plaza Park, Pier 1, Pier 2, Pier 5, Atlantic Ave, Cranberry St, the War
  Memorial, then round again with bigger crews). `state.block` is the turf number, so `wavePlan` and the
  weapon pickups follow it; every fifth turf is Big Tony's. Apples are the only weapon here
  (`arena.weapons = ['apples']`): a basket waits by each turf. A gold beacon (and a red pin on the minimap)
  marks the next turf; within `ARRIVE` = 32 m the crew comes out, spawned 12–22 m from him in the open
  (`spawnAt`: a street, sidewalk, park, the Promenade or the waterfront, at about his level). Gangsters
  further off than `STRAY` = 48 m come back round near him. Clearing a turf gives back two hearts; busted
  goes back to the Promenade and turf 1. The best run is saved as `ragdollBestTurfs`. It also draws the HUD
  in `heights.html` (hearts, turf, crew or distance, ammo, score, banner, Big Tony's bar, fade).
- **`heightsmini.js`** draws the street map once, Google-coloured, and shows it turned to true north: the
  round minimap follows the hero; **Tab** (or a click on it) opens the full map, where a click on land
  sends him there (`goTo` finds a clear spot at street level, or on the walkway when it's on the bridge).
- **`heightscars.js`** lets him use cars: **E** gets into the nearest one within 3.2 m (a parked car, which
  leaves its space and its collision box behind; a car out of the traffic, whose lane slot is marked
  `taken`; or one he drove before) and out again by whichever door has room. **W/S** drive and reverse,
  **A/D** steer (tight at low speed, for pulling out of a space), **Shift** floors it (about 80 mph), **H**
  honks. The car keeps an axis-aligned box in `movers` round its turned footprint; eight points round its
  body are checked against everything taller than `CLIMB` (curbs and the hills' steps it drives up), in
  short substeps so thin railings still stop it, and it bounces back off what it hits. Gangsters in front
  of the bumper at speed are run over (`hitByCar`: three hit points and knocked flat, with a cool-down so it
  counts once). He rides along hidden and invulnerable at the car's spot, so the crew still comes for the
  car; street traffic stops behind his cars. The camera sits further back and swings round behind the car.
- Controls as on Montague St, except that he always runs at the game's pace and **Shift** sprints (2.2×,
  through `hero.speed`), since the map is a kilometre across; **F** punches (held, with apples: keeps throwing), **G**
  kicks, **H** round kicks (honks in a car), **E** gets in or out of a car, or puts the apples down; **Tab** map, **1–7** places (Promenade, Brooklyn
  Bridge, Borough Hall, Pier 1, Cadman Plaza Park, Montague St, Atlantic Ave; not while he's down), **Esc**
  closes the map. Red dots on the minimap are the gangsters.
