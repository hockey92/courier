# Moving the ragdoll game to Blender + Godot — instructions for Claude Code

You're porting **Ragdoll Man vs the Gangsters 3D**, a browser game written in plain JavaScript and
Three.js, to a **Godot 4** project, with **Blender** used for the 3D assets. Read this whole file before
starting, then work through the phases in order. Commit at the end of every phase.

The user wants the result to look and play like the web version. A faithful port is the goal of this job.
Improving the art or the design comes afterwards and isn't part of this job unless the user asks for it.

---

## 0. Before you write any code

1. **Read `RAGDOLL_GUIDE.md` in full.** It's the design and technical spec: every system, constant,
   convention and known pitfall is documented there, and this file only points at it. Sections 4
   (conventions), 6 (characters and the physics), 17 (Brooklyn Heights) and 18 (Lower Manhattan) matter
   most for the port.
2. **Run the web version as the reference.** Nothing needs installing apart from Python:

   ```bash
   python3 -m http.server 8765
   # http://localhost:8765/ragdoll.html    the street game (the original)
   # http://localhost:8765/heights.html    Brooklyn Heights (3D map, turf run, cars, bikes)
   # http://localhost:8765/manhattan.html  Lower Manhattan (3D map, crowds, traffic, shop signs)
   # http://localhost:8765/montague.html   Montague St (walkable scene, no game)
   ```

   If you can drive a browser, take reference screenshots of each page and record a few numbers from
   the console (`window.game`, `window.heights`, `window.manhattan` expose the systems) so you can check
   the port against them. If you can't, ask the user to play each page for a minute and describe it.
3. **Check the tools are installed:** `godot --version` (4.3 or newer) and `blender --version` (4.x).
   If either is missing, tell the user and stop. Don't install them silently.
4. **Ask the user about anything in §2 ("Decisions") they haven't answered.** The defaults there are
   what to do if they don't care.

## 1. What's being ported

The JavaScript lives in `ragdoll/` (about 14,000 lines across ~50 files, no build step and no
dependencies apart from Three.js 0.160 from a CDN) and four pages:

| Page | Entry module | What it is |
|---|---|---|
| `ragdoll.html` | `ragdoll/main.js` | The original game: an endless side-scrolling NYC street in chunks, block-by-block gangster crews, Big Tony, weapons (AK-47, apples), carrying crates, traffic, rats, Pizza Rat mode, the sewer and the turtles' lair, zombie night, HUD, synthesized music |
| `heights.html` | `ragdoll/heights.js` | Brooklyn Heights: a walkable 3D neighbourhood from map data (`heightsmap.js`), a turf-to-turf run, drivable cars, fixed-gear bikes, minimap |
| `manhattan.html` | `ragdoll/manhattan.js` | Lower Manhattan from OpenStreetMap data (`manhattanmap.js`, about 820 streets), procedural buildings, ten turfs, traffic of 350 vehicles and a crowd of 220 people that follow the player, about 5,400 shop signs, subway entrances, signals; the Brooklyn Bridge links it to Brooklyn Heights |
| `montague.html` | `ragdoll/montague.js` | A single walkable street rebuilt from a photo; not a game |

`index.html` (Zombie Maze) and `platformer.html` (Cowboy Run) are separate 2D games. **They aren't
part of this port.**

Things the code does that the port must keep:

- **Everything is generated in code.** Models are boxes, cylinders and cones placed by code. Textures are
  painted on canvases at startup. Music and sound effects are synthesized live. There are no asset files.
- **A custom physics model for the characters.** The `Ragdoll` class (`ragdoll/ragdoll.js`) has three
  layers: a controller (tight movement, jumping, attacks), a pose (where the 11 joints should be this
  frame), and Verlet physics (points pulled towards the pose, stick constraints, push-out against boxes).
  The game's feel comes from this; see the guide §6.
- **A custom collision world.** Characters, cars, bikes, bullets and thrown things don't use a physics
  engine. They query axis-aligned boxes through `arena` (`boxesNear(x, range, z)`, `floorAt(x, z, y)`,
  `inSolid(x, y, z)`); the 3D maps keep the boxes in a grid. Decks (boxes with a `bottom`) can be walked
  under.
- **A fixed 60 Hz simulation.** `update()` runs in 1/60 s steps and every timer counts frames; `render()`
  only draws.
- **Deterministic worlds.** Layouts come from `seeded(n)` in `config.js` (a mulberry32-style generator), so
  a chunk or map looks the same every time.

## 2. Decisions (ask the user; use the defaults if they don't mind)

| Question | Default |
|---|---|
| Godot version and language | Godot 4.3+ with **typed GDScript**. C# only if the user asks. |
| Which pages | All four, in the order of the phases below. The 2D games stay as they are. |
| Character physics | **Keep the custom Verlet ragdoll**, ported line for line. Don't swap in Godot's `PhysicalBone3D` or `RigidBody3D`: they won't feel the same, and the combat tuning in the guide depends on the current model. |
| Character collision | Keep the custom box world (`arena`). Godot's physics engine may be used later for things like debris, but not for characters, cars or bikes in this port. |
| Where the city gets built | Port the generators to GDScript and **bake** each map from an editor (`@tool`) script into saved scenes and meshes, so the game loads fast. Keep the generators runnable so a map can be rebuilt. |
| What Blender is for | Character and prop models as glTF. First, `bpy` scripts that rebuild the current box models from the JavaScript definitions (so they match exactly); after that, hand-made improvements only if the user wants them. |
| Textures | Port the canvas painters to GDScript `Image` drawing (they're mostly filled rectangles). Text (street signs, shop signs) is rendered once through a `SubViewport` with `Label`s into an atlas. |
| Audio | Port the synthesizer to `AudioStreamGenerator`. If that turns out too fiddly, render the tune and each sound effect to WAV from the browser version once (an `OfflineAudioContext` run of `music.js`) and import those. Ask before going the WAV way. |
| Keep the web version? | Yes. Don't delete or change anything outside the new folders. |

## 3. Layout of the new project

Create these next to the existing files, on a new branch (`godot-port`):

```
godot/                  the Godot project (project.godot at its root)
  autoload/             State, Config, Rng (the seeded generator), Music, Save, Debug
  core/                 ragdoll.gd, arena.gd, combat.gd, weapons, carry, bottles, effects…
  street/               the original street game (chunks, brownstones, traffic, rats, sewer, turtles)
  maps/heights/         Brooklyn Heights: data, builder, baked scene
  maps/manhattan/       Lower Manhattan: data, builder, baked scene
  maps/montague/
  ui/                   HUD, banner, boss bar, minimap, big map, buttons
  assets/               glTF and PNG files exported from Blender or baked by the builders
  tests/                headless test scenes (see §6)
blender/                .blend files and the bpy scripts that build them
tools/                  scripts that convert the JavaScript map data to JSON
GODOT_GUIDE.md          the new project's guide, written as you go (same spirit as RAGDOLL_GUIDE.md)
```

Map the JavaScript modules to Godot like this: one `.gd` file per JS module where it makes sense, with
the same names and the same split between "changes state" (`_physics_process`, or a `tick()` called from
it) and "draws" (`_process`). Shared mutable values that live on `state` in JS go on the `State`
autoload. `window.game` and friends become a `Debug` autoload with the same commands, so scenarios can
be scripted.

## 4. Conventions to carry over exactly

- **Units and axes:** metres; `y` up; the street runs along `x`. Heading `h` means forward
  `(cos h, sin h)` on the x/z plane. Godot is also right-handed and y-up, so positions carry over as they
  are, but **rotations don't**: Godot's forward is −Z, and `rotation.y` turns the other way from the JS
  `heading`. Write one helper for heading → `Basis` and use it everywhere. Don't scatter sign flips.
- **Time:** set `Engine.physics_ticks_per_second = 60` and run the simulation in `_physics_process`.
  Every timer stays in frames. Test float cooldowns with `<= 0`, never `== 0` (guide §4 explains the bug
  this once caused).
- **Randomness:** port `seeded()` bit for bit, with explicit 32-bit wrapping (GDScript ints are 64-bit,
  so mask with `& 0xFFFFFFFF` and convert to signed where JS uses `| 0` and `Math.imul`). Write a test
  that its first 10 numbers for seeds 1, 42 and 99 match the JS output. Layouts depend on it.
- **Tuning numbers:** copy every constant from `config.js`, `combat.js`, `looks.js` and the guide's
  tables. Don't re-tune anything during the port.
- **Saves:** `localStorage` keys (`ragdollBestBlocks`, `ragdollSkin`, `ragdollCam`, `ragdollBestTurfsManhattan`…)
  become entries in a `ConfigFile` at `user://save.cfg`, with the same names.

## 5. Phases

Do them in order. Each ends with a commit and a short note in `GODOT_GUIDE.md`. If a phase turns up a
big problem (performance, a system that doesn't map onto Godot), stop and explain it to the user before
going on.

### Phase 1: skeleton and core

- Godot project, autoloads, input map with the same keys as the web version (guide §8 and the help text
  in `heights.js` / `manhattan.js`): arrows/WASD, Space, F, G, H, E, C, V, M, Z, R, Tab, Esc, 1–8.
- `Rng` (the seeded generator) with its test, `Config` constants.
- A box-world `Arena` with `boxes_near`, `floor_at`, `in_solid` and decks, matching `arena.js` and
  `heightsworld.js` / `manhattanworld.js` (grid lookups).
- **Done when:** the tests in §6 for the RNG and the box queries pass headless.

### Phase 2: the ragdoll

- Port `ragdoll.js` completely: controller, pose (run cycle, idle, flip, punches, backfist, kicks, round
  kick, guard, zombie slouch), Verlet step, sticks, push-out, stagger, knock-out and getting up.
- Draw it the way the JS does: one box `MeshInstance3D` per segment, oriented between two joint points
  (`orient()` in `materials.js`), and the elbow and knee cylinders. Port the looks and skins
  (`looks.js`) as data.
- A test scene: flat ground, a few boxes, the hero controllable, one gangster.
- **Done when:** the hero runs, jumps, flips, punches and kicks like the reference (compare screenshots
  and the combat checks in guide §13), and the scripted combat tests in §6 pass.

### Phase 3: the street game (`ragdoll.html`)

- Port chunks (`world.js`), brownstones, the homeless guy, traffic, signals and crossings, manholes,
  litter, rats and Pizza Rat mode, carrying, bottles, weapons (AK hitscan, laser, tracers; apples), the
  gangster kinds and their brains, Big Tony's charge, blocks and the gate, busted and restart, zombie
  night, the sewer and the turtles, cameras (side, behind, rat's-eye), HUD, banner and boss bar.
- Instancing: anything the JS draws as an `InstancedMesh` becomes a `MultiMeshInstance3D`.
- **Done when:** a full run plays: clear blocks 1–5 including Big Tony, die and restart, switch on
  zombie night, play the rat into the sewer and back. The look matches the reference screenshots.

### Phase 4: the 3D maps

- Write `tools/` scripts that turn `heightsmap.js` and `manhattanmap.js` into JSON (they're data
  exports: streets as point lists, parks, spots). Keep the OpenStreetMap credit
  ("© OpenStreetMap contributors, ODbL") in the data and in the game's credits.
- Port `heightsworld.js` and `manhattanworld.js` as `@tool` builders that bake each map. The JS `Batch`
  (`batch.js`) merges geometry per material per 200 m patch so it can be culled; do the same with
  `SurfaceTool`/`ArrayMesh` per material per patch, and `MultiMesh` for trees, lamps, hydrants, parked
  cars and the like.
- Port the map pages' systems: the turf run (`heightsrun.js`), drivable cars (`heightscars.js`), bikes
  (`heightsbike.js`, including the turn-collision rule described in the guide §17), the minimap and big
  map (`heightsmini.js`), street traffic, the crowd that follows the player, and the Brooklyn Bridge
  hand-over between the two maps (in the web version it loads the other page; in Godot, change scene and
  keep the player on the bridge deck).
- Montague St last; it's small.
- **Done when:** both maps load in a few seconds, run at 60 fps on the user's machine, and match the
  reference: the turfs, crowds and traffic, signs, signals, subway entrances, bridge crossing, minimap,
  bikes and cars.

### Phase 5: Blender assets

- Write `bpy` scripts in `blender/` that rebuild the box models from their JS definitions: the
  character parts and skins, gangster looks, the bike (`buildBike` in `heightsbike.js`), the traffic
  vehicles (cab, NYPD, USPS van, sedan in `manhattan.js`), the AK-47, apples and basket, the turtles,
  street props. Run them headless (`blender -b -P script.py`) to write `.blend` files and glTF exports
  into `godot/assets/`.
- Swap the code-built meshes in Godot for the imported ones only where it doesn't change the look.
  The ragdoll still moves the segments itself; if the user wants a skinned character later, drive a
  `Skeleton3D` from the 11 joint points and keep the Verlet model underneath.
- **Done when:** the game looks the same with the imported assets, and rebuilding any asset is one
  command.

### Phase 6: audio and polish

- Music and sound effects (§2). "Broadway Boogie" is original; keep it that way. Guide §10 says: only
  original music.
- Go through every item in the guide's "What you can do" (§1) and each map's section, and check it
  works in the port. List anything missing in `GODOT_GUIDE.md`.

## 6. Testing

There's no test suite in the web version. Build a small one in Godot as you go:

- A `tests/` folder of scenes, each running a scripted scenario through the `Debug` commands and
  printing PASS/FAIL, run headless with `godot --headless --path godot res://tests/<name>.tscn`.
  Exit with a non-zero code on failure so it can be run in a loop.
- Port the recipes in the guide §13 as tests: the RNG sequence; 3 punches, 2 kicks, or punch + kick each
  knock out a thug; a bruiser isn't staggered by punches; a thrower hits an idle man within about 60
  frames; Big Tony's charge lands after about 75 frames and goes dizzy at the street edge; the red light
  holds the man at the crossing; a bike wedged into a wall can ride out of it.
- Check visual work by taking screenshots from the Godot editor or a running build, and compare them
  with the web version side by side. Show the user the comparisons at the end of each phase.

## 7. How to work

- Work on the `godot-port` branch and commit at the end of every phase (and more often while you're in
  one), with messages in the style of the existing history: one plain sentence saying what changed.
- Port behaviour, not just shape: when a JS function has a comment explaining a constraint (why
  something is capped, why a check is ordered a certain way), keep that behaviour and that comment.
- Don't redesign, re-tune or "fix" gameplay during the port. If something looks like a bug in the
  original, note it in `GODOT_GUIDE.md` and ask the user.
- Keep `GODOT_GUIDE.md` up to date as you go: project layout, how to run it and the tests, how each JS
  system maps to Godot, the coordinate and rotation helpers, and anything that behaves differently.
- At the end of each phase, report to the user in plain language: what works, what doesn't yet, the
  comparison screenshots, and what's next.
