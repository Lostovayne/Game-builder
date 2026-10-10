/**
 * The starter kit that ships inside every sandbox.
 *
 * Depends on nothing but `./runtime`'s facts (same directory, same browser, no
 * build step), so it composes after it.
 */
export const engine = `# The engine kit

A Three.js starter kit ships with the game, in the game directory:

  engine/index.js   the barrel — import everything from here
  engine/*.js       one module per system

It is plain browser ESM, already on disk, and needs no install and no build.
The kit's index.html declares the import map that resolves the bare "three"
specifier, so \`import * as THREE from "three"\` works as written. If you
rewrite index.html, carry the import map across — a missing map is the one
mistake that blanks the screen.

Start from it instead of a blank file, replace what you outgrow, and keep
what still works: the kit is there to be used, edited and deleted as the
game needs.

# What is in it

- engine/engine.js — createGame(): renderer, scene, camera, fixed-timestep
  loop, resize handling, and the hooks the rest of the kit plugs into:
  add(...objects), setCamera(cam), addSystem(sys) (sys.update(dt, elapsed)
  each frame, in registration order), onUpdate(fn), onFixed(fn),
  on("resize"|"start"|"stop"|"pause"|"resume"), start/stop/pause/resume,
  dispose(). One game per page.

- engine/controls.js — createControls({ game }): keyboard, pointer, wheel,
  gamepad and touch in one input object. down/pressed/released by code,
  bind("jump", ["Space"]) then action("jump")/actionPressed("jump"),
  axis(pos, neg), pointer { x y dx dy ndcX ndcY buttons }, stick(deadzone),
  lock()/unlock() for pointer lock, onTap(fn). Auto-registers with the game.

- engine/hud.js — createHud(): DOM overlay over the canvas. bar(key, opts)
  returns { set(v) } health/progress bars, label(key, text), score(value),
  toast(), message(), crosshair(), flash(), vignette(). All CSS scoped and
  injected for you; dispose() removes it.

- engine/audio.js — createAudio(): WebAudio sound with zero audio files.
  play("jump" | "coin" | "explode" | "laser" | "gameover" | ... ) for the
  ~30 preset effects, tone()/noise() for one-offs, music({ bpm, steps })
  for sequenced loops, mute/toggleMute, per-bus volume (master/sfx/music).
  resume() unlocks the AudioContext after the first user gesture.

- engine/models.js — procedural geometry, no asset files: makeTree, makeRock,
  makeCloud, makeBuilding, makeGround, makePlatform, makeCoin, makeGem,
  makeCrystal, makeStar, makeChest, makeHeart, makeCrate, makeSword,
  makeShield, makeShip, makeCar, makePortal, and makeCharacter(...) — the
  last returns { group, parts, update(dt, { speed, air, t }) } and walks,
  idles and jumps procedurally. Every factory returns a THREE.Group with
  userData.parts and its own dispose().

- engine/textures.js — canvas textures drawn at runtime: gradient, noise,
  grid, checker, stripes, softDot, ring, text, spriteSheet, and canvasTexture
  for your own draw function. Everything is a file you didn't have to make.

- engine/materials.js — matte, toon, shiny, glass, emissive, unlit, outline,
  flat — one call each, colors as "#EA580C", 0xEA580C or "red".

- engine/lighting.js — createLighting(scene, "day" | "night" | "sunset" |
  "studio" | "flat" | "neon" | "underwater" | "horror") returns a rig with
  key/fill/rim/ambient lights, set(preset), setIntensity(k), dispose().

- engine/particles.js — createParticles({ max }): CPU pool with per-particle
  color/size in a custom shader. emit(pos, opts) / burst(pos, opts), plus
  themed helpers: sparks, explosion, smoke, confetti, snow, bubbles, fire.

- engine/animation.js — juice. tween(target, { to, duration, ease, repeat,
  yoyo, onComplete }), tweenChain, spring(target, prop, value, { stiffness,
  damping }), shake, popIn/popOut, bounce. Register tweenSystem with
  game.addSystem() once and every tween runs.

- engine/physics.js — createWorld({ gravity }): arcade AABB physics.
  addBody({ shape: "box"|"sphere"|"plane", size, position, velocity, mass,
  restitution, tag, object }), onCollision, raycast, overlap. Bodies sync
  their THREE object's position each step. Rotation is visual only — this
  is arcade physics, not a rigid-body solver.

- engine/camera.js — createFollowRig (laggy third-person follow with
  look-ahead), createOrbitRig (drag + wheel orbit), cameraShake(camera),
  transition(camera, { position, lookAt, duration }).

- engine/math.js — clamp, lerp, mapLinear, damp, moveTowards, wrap,
  smoothstep, angleDelta, ease(name, t), easings, createRng(seed) with
  int/float/pick/bool/shuffle/range. Pure, imports nothing.

# How they fit together

  const game = createGame({ el: document.body, shadows: true })
  const input = createControls({ game })          // registers itself
  const hud = createHud()
  const audio = createAudio()
  game.addSystem(tweenSystem)
  game.add(audio)
  game.onUpdate((dt, elapsed) => {
    if (input.actionPressed("jump")) audio.play("jump")
  })
  game.start()

Frame order is fixed: fixed-step updates (onFixed), then systems in
addSystem() order, then onUpdate callbacks, then render. Per-frame work goes
in update(dt, elapsed) on whatever object you add — never in your own
requestAnimationFrame.

# Rules the kit holds you to

- No asset files. Textures are drawn, models are built, sound is synthesised.
  A path to a file the game did not author is a broken image.
- No import-time side effects. Factories create the work when called; the
  modules themselves just export.
- dispose() everything you remove: geometries, materials, textures, HUD,
  audio, rigs. The kit does this for its own objects; do it for yours.
- The JSDoc in each file is the signature — read the module before using it
  rather than guessing option names from this list.`
