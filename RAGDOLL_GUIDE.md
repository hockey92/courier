# Ragdoll Man vs the Gangsters 3D — technical and design guide

How the game (`ragdoll.html` + the modules in `ragdoll/`) is built, the patterns it follows, and how to
extend it without breaking them.
Read this before changing the game; update it when you add a system or change a convention.

---

## 1. What the game is

A low-poly 3D brawler set on a New York street at dusk. You play a ragdoll who runs, jumps,
flips, punches and kicks his way through endless gangsters, past brownstones, rats, litter and a guy
chilling on his cardboard. Getting hit costs hearts; losing them all means **Busted!** and the survival
timer resets.

### What you can do
- **Fight as the man.** Run down an endless street, jump (again in mid-air to flip), punch (**F**) and
  kick (**G**, twice as hard). Knock gangsters out with punches, kicks or a stomp on the head. Up to
  three come at you at once and they fight back; you have 6 hearts.
- **Chase a score.** The HUD shows how long you've survived, your best time (saved), knockouts and
  the farthest you've got along the street.
- **Change your look.** **C** or the ◀ ▶ buttons cycle the skins: New Yorker, Mamdani, Construction
  Worker, Classic Ragdoll (saved).
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
| `config.js` | units, body sizes, tuning constants, maths helpers | `S`, `GRAVITY`, `Z_MIN/Z_MAX`, `CHUNK`, `seeded`, `lerp`, `rot` |
| `state.js` | shared state several files read **and change** (see below) | `state`, `showFrontRow` |
| `scene.js` | renderer, scene, sky gradient, fog, camera, lights, stars | `renderer`, `scene`, `camera`, `keyLight`, `stars` |
| `materials.js` | cached boxes/colours, painted textures, apartment facades, crate/glow, box-between-points helpers | `boxGeo`, `mat`, `addBox`, `canvasTex`, `addBuilding`, `cylGeo`, `orient`, `limb`, `bendPoint` |
| `brownstones.js` | brownstone facades, stoops, railings, cornices, iron fences | `FACADE_Z`, `addBrownstone`, `fence` |
| `homeless.js` | the guy chilling on his cardboard | `buildHomeless` |
| `world.js` | chunk data (obstacles, collision boxes, house rows, manholes), chunk building, skyline, chunk loading | `getChunkData`, `boxesNear`, `floorAt`, `openManholeAt`, `liveChunks`, `syncChunks` |
| `music.js` | "Broadway Boogie" and sound effects, all synthesised | `music` |
| `effects.js` | dust puffs | `dust`, `updateDust` |
| `ragdoll.js` | skeleton and the `Ragdoll` class: controller, attacks, pose, physics, meshes | `Ragdoll`, `NAMES` |
| `looks.js` | gangster suits and hero skins | `GANGSTER_LOOK`, `SKINS`, `SKIN_ORDER` |
| `actors.js` | the hero and the gangster list | `man`, `gangsters` |
| `turtles.js` | the four ninja turtles: box bodies, hand-made poses (idle activities, cheering) | `buildTurtle`, `applyPose`, `idlePose`, `cheerPose` |
| `sewer.js` | the sewer and the turtles' lair: geometry, collision, dropping in / climbing out, the turtles' reactions | `sewer`, `SEWER_Y`, `dropIn`, `stepTransition`, `leaveSewer`, `updateSewer`, `renderSewer` |
| `view.js` | the camera rig: side, behind and rat's-eye views, key light following | `camPos`, `updateCamera` |
| `rats.js` | AI rats and the rat you drive | `rats`, `updateRats` |
| `garbage.js` | wind and instanced litter | `updateGarbage`, `renderGarbage` |
| `combat.js` | gangster spawning and brain, landing hits, stomps, getting busted | `spawnGangster`, `gangsterBrain`, `resolvePunches`, `checkHits`, `behind` |
| `ui.js` | skin picker, camera switch, man/rat switch, help bar, HUD | `setSkin`, `setCamMode`, `setPlayingRat`, `updateHud` |
| `input.js` | held keys, one-shot actions, hotkeys | `keys`, `queued` |
| `main.js` | `update()` (the fixed-step tick), `render()`, the loop, `window.game` | — |

### Module rules
- **Import what you use, by name** (`import { mat, addBox } from './materials.js'`). Every top-level
  `const`/`let`/`function`/`class` is exported so other files can pick it up.
- **Shared mutable state goes in `state`.** An imported binding can't be reassigned by the importer, so
  values that several files *change* live on the `state` object: `camMode`, `camYaw`, `camX`, `camZ`,
  `playingRat`, `ratPlayer`, `survived`, `best`, `knockouts`, `farthest`, `spawnTimer`, `shake`,
  `caughtTimer`, `fade` (the full-screen black-out, drawn by `updateHud`). Write `state.shake = 0.15`, never a separate `let shake`. One-shot key presses are
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
| -2.2 … 3.4 | road (centre line at 0.6, taxis -1.2 … 2.4) |
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
- `localStorage` keys: `ragdollBestTime`, `ragdollSkin`, `ragdollCam`. Prefix new keys with `ragdoll`.
- `window.game` exposes `man, gangsters, update, render, keys, boxesNear, jump(), punch(), kick(),
  music, rats, setSkin, setPlayingRat, sewer, paused`. Add new systems here so they can be driven from the
  console.

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
  `boxesNear(x, range)` fetches them; `floorAt(x, z, y)` finds what you're standing on.
- Bodies are blocked from the side unless their feet are above `top`; limbs and litter are pushed out
  along the shallowest side; rats squeeze around.
- Low things (under ~1.45 m) can be hopped by gangsters; you can stand on anything.

### Adding an obstacle type
1. `obstacleBoxes(o)`: return its collision box(es).
2. `buildObstacle(g, o)`: build it from `addBox` calls at `o.x, o.z`.
3. `getChunkData`: add it to the `roll` table and choose its z range.
4. Check it doesn't land on the lamp, the homeless guy or the start (there are nudge rules for those).

### Manholes
- One per chunk in the road, from its own stream `seeded(i * 6151 + 31)`; ~40% are left open (cover slid
  aside, a traffic cone with a collision box). Chunk 0 always has an open one at x = 3.5, z = -0.6, just
  ahead of where Pizza Rat appears. A manhole within 0.9 m of an obstacle box always stays closed.
- `openManholeAt(x, z)` is what the rat you play checks while it's on the ground; nothing else falls in.

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

### Attacks
- `Ragdoll.swing(t, windup, hold, back)` turns an attack timer into `[wind, ext]` amounts (0…1):
  wind up → 4 frames out → hold → pull back. Punches use the right arm (`punchT`, hold 4, back 8),
  kicks the left leg (`kickT`, hold 6, back 10).
- The blow lands on the frame `t === windup + 4`: `control()` sets `punchHit` / `kickHit`, and the
  game resolves it in `resolvePunches()` through `landHit(attacker, flag, reach, vReach, limbEnd,
  targets, onHit)`. The class never needs to know who it's fighting.
- Attacks step the attacker forward (punch +0.035, kick +0.06) so combos stay in range despite
  knockback. If you change knockback, re-test that three punches / two kicks still connect.
- Starting a flip, getting staggered or knocked out calls `cancelAttacks()`.

### Taking hits
- `stagger(dx, dz, power)`: knockback, a head/neck snap (by moving the points' previous positions),
  a lean back in `pose()`, and `stun = 15 + 10 * power` frames of no input.
- `knockOut(dx, dz, frames, power)`: stiffness to 0 so the body goes limp, plus an impulse. When
  `knocked` counts down, `getUp()` restores control, stiffness ramps back and `hp` refills.
- Invulnerability `invuln` makes the body blink: 30 frames after a hit, 90 after getting up.

### Current combat numbers

| | Hero | Gangster |
|---|---|---|
| Health | 6 hearts | 3 |
| Punch | wind-up 3, 1 damage, reach 1.0 m | wind-up 20, 1 damage |
| Kick | wind-up 6 (`KICK_WINDUP`), 2 damage, reach 1.2 m, vertical reach 1.7 m (flying kicks) | wind-up 16, 2 damage |
| Stomp | landing 1.25–1.95 m above a gangster's feet knocks him out | — |
| Between attacks | — | 45–90 frames; picks next move ahead (40% kick) |

At most `MAX_GANGSTERS = 3`, one spawning every 480 frames. `behind()` spawns them just out of view:
behind the hero in side view, ahead up the street in behind view. Stragglers over 34 m away are
re-placed the same way.

### Gangster AI (`gangsterBrain`)
Returns the same inputs a player gives: `[ix, iz, jump, punch, kick]`. Approach to arm's length, spread
out from each other, slide around tall obstacles, hop low ones, track the hero during the wind-up but
commit once the blow is on its way (so sidestepping works), and stand around when he's down.
New enemy behaviour should keep going through `control()` this way.

### The physics, briefly
Verlet integration (velocity = position − previous position, 1% damping), 11 points, 11 sticks
including a weak head-to-hip stick that stands in for a spine limit. Hits are impulses made by
shifting previous positions. No joint limits or self-collision; limbs can't twist. That's the
trade-off for something tiny, stable and easy to blend with animation.

## 7. Looks and skins

- `GANGSTER_LOOK` and every entry in `SKINS` share one shape:

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
- Props that need to follow a joint without rotating with it (the coffee cup) are placed in
  `updateMeshes()`; set them in `decorate` (e.g. `r.cup`) and handle them there.
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
| F / G | punch / kick (auto-turns to the nearest gangster) | same |
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
- While you're a rat the man stands still, `gangsterBrain` returns no input, nothing spawns and the
  survival timer is paused, so it's a free-roam mode. Gangsters' wind-ups are cancelled on switching.
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

- **Litter** (`GARBAGE_TYPES`): one `InstancedMesh` per type (137 pieces in total), blown by a gusty
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

- Top-left: timer, hearts (♥/♡ from `man.hp`), best time / KOs / farthest. Top-right: skin picker,
  camera button, "Playing:" (man/rat) button, and the green "↑ Back to the street" button while the rat
  is underground. Bottom: help bar (rewritten for the man, the rat and the sewer). Centre: "Busted!".
  Between the 3D view and the HUD: `#fade`, the black-out for the manhole transitions.
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
  kicks, and punch + kick each knock out every gangster (their `accel` differs, test all three);
  hitting a gangster during his wind-up cancels it; flying kicks land at low and mid jump height.
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
- Ideas that fit the existing patterns: more skins, a subway entrance or bodega obstacle, pigeons
  (rats' state machine), a second song that switches when the hearts run low, pickups (a slice that
  restores a heart), a block-the-blow move driven through `control()`.

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
