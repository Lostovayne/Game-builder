# Feature: Three.js game-engine primitives seeded into every new sandbox

**Objective:** `lib/games/runtime/` stops being a one-file placeholder and becomes a
starter kit: a plain-ESM Three.js primitive library plus a 3D welcome page, so the
game-building agent starts from working systems instead of a blank file.
**Branch:** `feat/game-engine-kit` · **Delivery:** work-unit commits on the branch;
push/PR remain the user's decision. **Test runner:** `pnpm test` (Vitest, node env).

## L1 — original request (verbatim)

> use three-js skills to develop game engine generation primitives in @lib/games/runtime/
>
> - engine
> - hud
> - controls
> - animations
> - models
> - sounds
> - ... anything you can think of that can be useful for game generation
>
> also update @lib/games/instructions/ as you deem useful, you are permitted to addr or edit existing files
> update @lib/games/runtime/index.html to load three-js module and to have a nice 3d welcome page with a rotating cube in colors of our @public/logo.svg

## Specs

- **S1 — Primitives library.** `lib/games/runtime/engine/` holds plain-ESM modules
  covering the named areas — `engine`, `hud`, `controls`, `animations`, `models`,
  `sounds` — plus everything else useful for game generation, exposed through
  `engine/index.js`. Final file list is pinned in **Contract § Files**.
- **S2 — No build step.** Every file runs as-is in a browser: `.js` ESM, no
  TypeScript, no JSX, no bundler, no npm install in the sandbox. `three` is a bare
  specifier resolved by the import map that `index.html` declares.
- **S3 — No assets.** Textures are drawn to a canvas, models are built from
  geometry, sound is synthesised with WebAudio. Nothing loads a file the sandbox
  did not author.
- **S4 — Welcome page.** `lib/games/runtime/index.html` loads the Three.js module
  and renders "a nice 3d welcome page with a rotating cube in colors of our
  `public/logo.svg`" — orange `#EA580C`, white, dark neutral background.
- **S5 — The welcome page runs on the kit.** It imports `./engine/index.js` and
  drives the cube through `createGame`, so a broken kit breaks the seed visibly.
  It stays a starting point the agent replaces on the first turn, not a title
  screen shipped with a game.
- **S6 — Instructions describe what is now there.** `lib/games/instructions/`
  gains a catalogue of the kit and corrects the two statements the kit makes false
  ("A new sandbox starts with one file", "There is no starter code, no library and
  no asset"), while preserving the import-map warning and the "first turn replaces
  the placeholder" workflow.
- **S7 — Verification.** The pure module gets real Vitest unit tests written RED
  before implementation; the whole kit is proven in a real browser (static server +
  headless browser against `lib/games/runtime`) with zero console errors and a
  rendered cube. Browser-only modules (WebGL, DOM, WebAudio) get no node-level RED:
  there is no runnable deterministic node test for them — that exception is
  recorded, not papered over.
- **S8 — Blast radius.** No new runtime dependency for the sandbox; the Next app's
  dependency set is untouched; every previously passing test keeps passing; only
  files this feature owns are staged.

## Contract

### Files

```
lib/games/runtime/
  index.html                 parent-owned (S4, S5)
  engine/
    index.js                 parent-owned barrel: `export * from` each module below
    math.js        U1        pure helpers, imports nothing
    engine.js      U1        createGame
    controls.js    U2        createControls            (no three)
    hud.js         U2        createHud                 (no three)
    audio.js       U2        createAudio               (no three, WebAudio)
    textures.js    U3        canvas texture generators (three)
    materials.js   U3        material presets          (three)
    lighting.js    U3        light rigs                (three)
    models.js      U3        procedural model factories(three)
    particles.js   U3        particle system           (three)
    animation.js   U4        tween / spring / juice    (three)
    physics.js     U4        arcade world              (three)
    camera.js      U4        camera rigs               (three)
```

### Conventions (bind every file)

1. Plain browser ESM. `import * as THREE from "three"` **only** where three is
   actually used; `math.js`, `controls.js`, `hud.js`, `audio.js` import no three.
2. **No side effects at import time.** No listeners, no DOM writes, no
   `AudioContext`, no `requestAnimationFrame` until a factory is called.
3. Every factory is `createX(options = {})` (models use `makeX(...)`) returning a
   plain object, never a class the caller must `new`.
4. Every object owning GPU, DOM or audio resources exposes `dispose()`.
5. Per-frame work is exposed as `update(dt, elapsed)` — arguments may be ignored —
   so `game.addSystem(obj)` drives it. `update` must be safe to call before init.
6. JSDoc on every export: one-line summary, `@param` with option names, `@returns`.
   The JSDoc is the authoritative signature the game agent reads.
7. Option objects are all-optional with sensible defaults; unknown keys are ignored.
8. Colors accept anything `THREE.Color` accepts (`"#EA580C"`, `0xEA580C`, `"red"`).
9. No `console.log` in library code. Fail loudly only for programmer errors
   (missing required option) via `throw new Error("...")` with a fixable message.

### Frame order (engine.js is the only authority)

```
fixed steps (accumulator, default 60 Hz, capped at 5 catch-up steps)
  -> systems update      game.addSystem order
  -> onUpdate callbacks  game.onUpdate order
  -> render
  -> input edge flip     (controls.update() is a system, registered first by caller)
```

`createControls({ game })` auto-registers itself with `game` and returns a
fully-wired input; without `game` the caller must `game.addSystem(input)`.

### Shared dependency

`engine/math.js` is the only cross-unit import. Its exports are frozen here — U2,
U3, U4 may import them and nothing else from another unit.

```js
clamp(v, min, max)
lerp(a, b, t)
invLerp(a, b, v)
mapLinear(v, a1, a2, b1, b2)
damp(a, b, lambda, dt) // frame-rate independent, returns new value
moveTowards(a, b, maxDelta)
wrap(v, min, max)
smoothstep(edge0, edge1, x)
degToRad(d) / radToDeg(r)
angleDelta(a, b) // shortest signed difference, radians
angleLerp(a, b, t)
ease(name, t) // t clamped to [0,1]
easings // { linear, quadIn, quadOut, quadInOut,
//   cubicIn, cubicOut, cubicInOut,
//   sineInOut, expoOut, circOut,
//   backOut, elasticOut, bounceOut }
createRng(seed) // mulberry32; -> { int, float, pick, bool,
//   shuffle, range(min,max) } ; seed may be
//   number | string
```

### Per-module API (frozen)

```js
// engine/engine.js
createGame(options) -> game
// options: { el, background, fov = 60, near = 0.1, far = 1000, antialias = true,
//            shadows = false, pixelRatio, maxPixelRatio = 2, fixedStep = 1/60,
//            camera, clearAlpha }
// game: renderer scene camera clock canvas elapsed delta frame fps paused
//       add(...o) remove(...o) setCamera(c)
//       onUpdate(fn)->off  onFixed(fn)->off  addSystem(sys)->removeFn
//       on(evt, fn)->off   // "resize" | "start" | "stop" | "pause" | "resume"
//       start() stop() pause() resume() resize() dispose()

// engine/controls.js
createControls(options) -> input
// options: { game, target = window, preventDefault = true, wheel = true, pointerLock = false }
// input: down(code) pressed(code) released(code)
//        bind(name, codes) action(name) actionPressed(name)
//        axis(posCode, negCode) -> -1|0|1
//        pointer { x y dx dy ndcX ndcY buttons }  wheel (deltaY this frame)
//        stick(deadzone) -> { x y }   gamepad(index) -> Gamepad|null
//        lock() unlock() isLocked  onTap(fn)->off  update()  dispose()

// engine/hud.js
createHud(options) -> hud
// options: { parent = document.body, theme = {} }
// hud: bar(key, opts) -> { set(v), remove() }   // opts: { label, max, value,
//            color, back, height, width, position: "top-left"|"top"|"top-right"|
//            "bottom-left"|"bottom"|"bottom-right" }
//       set(key, value)  label(key, text, opts)  score(value, opts)
//       toast(text, opts)  message(text, opts)  crosshair(on, opts)
//       flash(opts)  vignette(on, opts)  hide() show() clear() update(dt)
//       el dispose()

// engine/audio.js
createAudio(options) -> audio
// options: { master = 0.8, sfx = 1, music = 0.45 }
// audio: play(name, opts) -> voice|null
//        tone(opts) noise(opts)
//        music(nameOrPattern, opts) stopMusic(opts)
//        mute(on?) toggleMute() isMuted  setVolume(bus, v)  volume(bus)
//        resume() ready  update(dt)  dispose()
// PRESET NAMES (frozen): jump land coin powerup hit hurt explode laser splash
//   click select start gameover win lose check deny whoosh blip boom pickup
//   damage step bounce portal
// music pattern: { bpm, loop, steps: [{ at, note|freq, dur, type, gain }] }

// engine/textures.js
gradientTexture(o) noiseTexture(o) gridTexture(o) checkerTexture(o)
stripesTexture(o) softDotTexture(o) ringTexture(o) textTexture(text, o)
spriteSheet(o)  // -> { texture, frame(i), cols, rows, dispose() }
canvasTexture(draw, o)  disposeTexture(t)
// common: { size = 256, repeat, nearest = false }

// engine/materials.js
matte(color, o) toon(color, o) shiny(color, o) glass(color, o)
emissive(color, o) unlit(color, o) outline(color, o) flat(color, o)
disposeMaterial(m)

// engine/lighting.js
createLighting(scene, preset, o) -> rig   // -> { key, ambient, fill, rim, all,
                                           //      set(preset), setIntensity(k),
                                           //      update(dt), dispose() }
// presets (frozen): "day" "night" "sunset" "studio" "flat" "neon" "underwater"
//                   "horror"
ambientLight(o) keyLight(o) fillLight(o) rimLight(o) hemiLight(o)
enableShadows(light, o)

// engine/models.js  — every factory returns THREE.Group with userData.parts
makeTree(o) makeRock(o) makeCloud(o) makeBuilding(o) makeGround(o) makePlatform(o)
makeCoin(o) makeGem(o) makeCrystal(o) makeStar(o) makeChest(o) makeHeart(o)
makeCrate(o) makeSword(o) makeShield(o) makeShip(o) makeCar(o) makePortal(o)
makeCharacter(o) -> { group, parts, update(dt, state), dispose() }
// makeCharacter: parts = { head, torso, armL, armR, legL, legR }
//   update(dt, { speed = 0, air = false, t }) drives procedural walk/idle
//   options: { height = 1.8, palette = { body, accent, skin }, style = "humanoid" }

// engine/particles.js
createParticles(o) -> system   // { max = 2000, gravity, drag, blending, texture }
// system: emit(pos, opts) burst(pos, opts) update(dt) clear() dispose()
//   opts: { count, color, size, sizeEnd, speed, spread, direction, life, gravity }
// helpers (all take a position): sparks explosion smoke confetti snow bubbles fire

// engine/animation.js
tween(target, o) -> handle     // { to, from, duration, delay, ease, repeat, yoyo,
                               //   onStart, onUpdate, onComplete } ->
                               //   { stop, finish, progress, get done() }
tweenChain(steps) -> handle
spring(target, prop, value, o) -> handle   // { stiffness, damping, restDelta }
shake(target, o) popIn(target, o) popOut(target, o) bounce(obj, o)
tweenSystem                    // { update(dt) } — game.addSystem(tweenSystem)
updateTweens(dt)

// engine/physics.js
createWorld(o) -> world        // { gravity = -20, fixedStep = 1/60, restitution default }
// world: addBody(spec) -> body  removeBody(b)  step(dt)  onCollision(fn)
//        raycast(origin, dir, o) -> hit|null   overlap(box) -> bodies
// body spec: { shape: "box"|"sphere"|"plane", size|radius, position, velocity,
//              mass = 1, restitution, friction, isStatic, tag, object, onCollide }
// body: position velocity applyImpulse(v) teleport(v) dispose()
// Physics is axis-aligned: `object.rotation` is visual only and never simulated.

// engine/camera.js
createFollowRig(camera, o) -> rig   // { target, offset, lookOffset, lag, lookAhead,
                                    //   setTarget(o), update(dt), dispose() }
createOrbitRig(camera, o) -> rig    // { target, distance, min/maxDistance, damping,
                                    //   update(dt), dispose() }  (drag + wheel)
cameraShake(camera) -> { add(amount, duration), update(dt), dispose() }
transition(camera, o) -> handle      // { position, lookAt, duration, ease, onUpdate }
```

## Tasks

- [x] T1 — **RED:** `lib/games/runtime.test.ts` covering `engine/math.js`: `clamp`,
      `lerp`, `invLerp` round-trip, `damp` frame-rate independence, `ease` clamps
      and is monotonic for the monotonic set, `createRng` reproducibility and
      range bounds, `angleDelta` shortest-path, `wrap`. Route: inline. Evidence: RED.
- [x] T2 — **Parallel writers (Writer trigger: parallelism — four independent
      units, disjoint edit surfaces, each heavier than a subagent):**
      U1 `math.js`+`engine.js` · U2 `controls.js`+`hud.js`+`audio.js` ·
      U3 `textures.js`+`materials.js`+`lighting.js`+`models.js`+`particles.js` ·
      U4 `animation.js`+`physics.js`+`camera.js`. Contract above is binding;
      each writer loads its Three.js skills first. Evidence: GREEN per unit.
- [x] T3 — **Integration (inline):** `engine/index.js` barrel (verify no export
      collisions), `lib/games/runtime/index.html` welcome page per S4/S5.
- [x] T4 — **Instructions (inline):** new `lib/games/instructions/engine.ts`
      catalogue, corrections in `runtime.ts` and `workflow.ts`, composition and
      test in `index.ts` / `index.test.ts`.
- [ ] T5 — **Verify:** focused `pnpm test --run lib/games/runtime.test.ts`, then
      full `pnpm test`, `pnpm run lint`, `pnpm run typecheck`; browser smoke test
      (static server on `lib/games/runtime` + headless browser): zero console
      errors, canvas non-blank, cube rotates, every barrel export callable.
- [ ] T6 — **Commit:** work-unit commit on `feat/game-engine-kit` with code, tests
      and docs together.

## Log

- **L1 (2026-10-09)** — user request verbatim, recorded above as L1.
- **L2 (2026-10-09)** — Explore: `lib/games/runtime/` holds only `index.html`
  ("New Game"); `seedRuntimeTree` (`lib/daytona/utils.ts:37`) mirrors the whole
  tree into every sandbox, and `trigger.config.ts` already copies
  `lib/games/runtime/**/*` into the build. Tests mock `node:fs/promises`, so no
  test pins the real `index.html` bytes. `three` is not a repo dependency and the
  sandbox has no package install, so `three@0.186.1` comes from jsdelivr via an
  import map (URLs verified 206 OK for `build/three.module.js`,
  `examples/jsm/controls/OrbitControls.js`, `examples/jsm/utils/BufferGeometryUtils.js`).
- **L3 (2026-10-09)** — Route declared: large task → feature doc; four units
  delegated in parallel by the Writer trigger (parallelism), integration seams
  (`index.html`, barrel, instructions) written by the parent inline.
- **L4 (2026-10-09)** — Test-first exception recorded: only `math.js` has a
  runnable deterministic node test; `engine/hud/controls/audio/textures/materials/
lighting/models/particles/animation/physics/camera` require a real browser
  (WebGL context, DOM, AudioContext), so S7 substitutes a browser smoke test.
  RED evidence for `math.js` is still required before its implementation lands.
- **L5 (2026-10-09)** — T1 closed: `lib/games/runtime.test.ts` written RED then
  GREEN, 26 tests passing against `engine/math.js`. T2 units U1–U3 landed
  (math, engine, controls, hud, audio, textures, materials, lighting, models,
  particles); U4 (animation, physics, camera) still open at session resume.
- **L6 (2026-10-09)** — Session resume: reconciled the feature doc against the
  working tree (`git status`, test run). `package.json` (infisical wrapper) and
  unrelated `trigger.config.ts` reformat are pre-existing working-tree noise —
  only feature-owned files are staged at T6.
- **L7 (2026-10-09)** — T2 closed: U4 (`animation.js`, `physics.js`, `camera.js`)
  delivered by `gentle-ai-worker` (self-review pass caught 7 defects pre-handoff:
  plane invMass, plane-plane crash, box half-extents, spring reassignment,
  setTarget null, cameraShake overwrite, duplicated easing table). T3 closed:
  barrel verified — 13 modules, 87 exports, zero name collisions,
  `node --check` OK; `index.html` written per S4/S5 (logo palette `#EA580C`
  cube + white edges on `#141416`, import map three@0.186.1, HUD copy via
  `createHud`, scene built only from kit factories). T4 closed: `engine.ts`
  catalogue + `runtime.ts`/`workflow.ts` corrections, composition
  `[workflow, runtime, engine]`, 9 instruction tests green.
