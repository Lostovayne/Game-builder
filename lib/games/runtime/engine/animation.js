// Tweening, springs and juice effects for the seeded runtime.
//
// Every animation funnels into one shared tween list that `updateTweens(dt)`
// (or `tweenSystem`, registered with `game.addSystem(tweenSystem)`) drains
// once per frame. No side effects at import time: the list starts empty and
// only the factories below populate it.

import * as THREE from "three"

import { clamp, easings, lerp } from "./math.js"

/** Finite-number option lookup with a fallback default. */
function num(value, fallback) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback
}

/** Non-negative number option; `Infinity` is allowed through on purpose. */
function numOrInf(value, fallback) {
  return value === Infinity ? Infinity : num(value, fallback)
}

/** True when `v` looks like a Vector3 (has numeric x/y/z), Vector3 included. */
function isVecLike(v) {
  return (
    v !== null &&
    typeof v === "object" &&
    typeof v.x === "number" &&
    typeof v.y === "number" &&
    typeof v.z === "number"
  )
}

/** True when `v` looks like a Color (has numeric r/g/b), THREE.Color included. */
function isColorLike(v) {
  return (
    v !== null &&
    typeof v === "object" &&
    typeof v.r === "number" &&
    typeof v.g === "number" &&
    typeof v.b === "number"
  )
}

/** Copies any Vector3-like option into a fresh THREE.Vector3. */
function toVector(v) {
  return new THREE.Vector3(v.x, v.y, v.z)
}

/** Copies any Color-like option into a fresh THREE.Color. */
function toColor(v) {
  return new THREE.Color(v.r, v.g, v.b)
}

/**
 * Resolves the `ease` option into a `(t) => number` function.
 *
 * @param {string|function} [option] Easing name from `easings`, or a custom curve.
 * @param {string} fallback Easing name used when `option` is omitted.
 * @returns {function(number): number} The easing function (input is clamped to `[0, 1]`).
 * @throws {Error} When `option` is neither a function nor a documented easing name.
 */
function resolveEase(option, fallback) {
  const name = option === undefined || option === null ? fallback : option
  if (typeof name === "function") return name
  if (
    typeof name === "string" &&
    Object.prototype.hasOwnProperty.call(easings, name)
  ) {
    return (t) => easings[name](clamp(t, 0, 1))
  }
  throw new Error(
    `Unknown easing "${String(name)}". Use one of: ${Object.keys(easings).join(", ")}, or pass a (t) => number function.`
  )
}

// --- shared tween list ------------------------------------------------------

/** @type {Array<{ update: (dt: number) => void, done: boolean }>} */
const active = []

/** Adds an entry to the shared list; `updateTweens` removes it once `done`. */
function register(update) {
  const entry = { update, done: false }
  active.push(entry)
  return entry
}

/**
 * Advances every live tween, spring, shake and bounce by `dt` seconds.
 *
 * Register `tweenSystem` with `game.addSystem(tweenSystem)` instead of calling
 * this by hand — calling both would run animations at double speed.
 *
 * @param {number} dt Seconds since the last call; negative values are treated as `0`.
 * @returns {void}
 */
export function updateTweens(dt) {
  const step = typeof dt === "number" && Number.isFinite(dt) && dt > 0 ? dt : 0
  for (let i = active.length - 1; i >= 0; i--) {
    const entry = active[i]
    entry.update(step)
    if (entry.done) active.splice(i, 1)
  }
}

/**
 * System wrapper around `updateTweens`, shaped for `game.addSystem`.
 *
 * @returns {{ update: (dt: number, elapsed: number) => void }} The tween system.
 */
export const tweenSystem = {
  update(dt) {
    updateTweens(dt)
  },
}

// --- tween ------------------------------------------------------------------

/**
 * Tweens numeric, Vector3 and Color properties of `target` towards `to`.
 *
 * Each key of `to` is one track: a number interpolates the matching numeric
 * property, a Vector3-like value interpolates `target[key]` (which must
 * already be a Vector3, e.g. `mesh.position`), and a Color-like value
 * interpolates a Color property. The tween starts automatically; drive it
 * with `tweenSystem` / `updateTweens`.
 *
 * @param {object} target Object whose properties animate (a mesh, a material, a Vector3...).
 * @param {object} [o] Options; unknown keys are ignored.
 * @param {object} o.to Destination values, e.g. `{ y: 5 }`, `{ position: new THREE.Vector3(0, 5, 0) }` or `{ color: new THREE.Color("red") }` (required).
 * @param {object} [o.from] Start values with the same shape as `to`; defaults to the current values, captured when the tween is created.
 * @param {number} [o.duration=0.5] Seconds per play-through (not counting `delay` or repeats).
 * @param {number} [o.delay=0] Seconds to wait before the first cycle starts.
 * @param {string|function} [o.ease="cubicInOut"] Easing name (see `math.js` `easings`) or a custom `(t) => number` curve.
 * @param {number} [o.repeat=0] Extra play-throughs after the first; `Infinity` loops forever.
 * @param {boolean} [o.yoyo=false] Alternate direction on every second repeat.
 * @param {function} [o.onStart] `fn(handle)` once, when `delay` elapses.
 * @param {function} [o.onUpdate] `fn(p, handle)` every frame while playing; `p` is the eased cycle progress in `[0, 1]`.
 * @param {function} [o.onComplete] `fn(handle)` once, when the last cycle ends.
 * @returns {{ stop: () => void, finish: () => void, progress: number, done: boolean }} handle —
 *   `stop()` cancels (freezing current values, `done` becomes `true`);
 *   `finish()` jumps to the final value and fires `onComplete`;
 *   `progress` is overall completion in `[0, 1]`;
 *   `done` is `true` once finished or stopped.
 * @throws {Error} When `target` is not an object, `to` is missing, a `to` value
 *   is not a number/Vector3/Color, or a vector/color track has no matching
 *   property on `target`.
 */
export function tween(target, o = {}) {
  if (target === null || typeof target !== "object") {
    throw new Error(
      'tween: "target" must be an object to animate (for example a mesh or a Vector3). Pass the object whose properties should move.'
    )
  }
  const to = o.to
  if (to === null || typeof to !== "object") {
    throw new Error(
      'tween: option "to" must be an object of destination values, e.g. { to: { y: 5 } } or { to: new THREE.Vector3(0, 5, 0) }.'
    )
  }

  const duration = Math.max(0, num(o.duration, 0.5))
  const delay = Math.max(0, num(o.delay, 0))
  const repeat = Math.max(0, numOrInf(o.repeat, 0))
  const totalCycles = repeat + 1
  const yoyo = o.yoyo === true
  const easeFn = resolveEase(o.ease, "cubicInOut")
  const onStart = typeof o.onStart === "function" ? o.onStart : null
  const onUpdate = typeof o.onUpdate === "function" ? o.onUpdate : null
  const onComplete = typeof o.onComplete === "function" ? o.onComplete : null
  const fromOpt = o.from !== null && typeof o.from === "object" ? o.from : null

  // Build the tracks up front so bad options fail fast, before the first frame.
  const tracks = []
  for (const key of Object.keys(to)) {
    const end = to[key]
    const current = target[key]
    if (isVecLike(end)) {
      if (!isVecLike(current)) {
        throw new Error(
          `tween: "to.${key}" is a Vector3 but target.${key} is not. The target property must already be a Vector3 (for example mesh.position) to tween it as a vector.`
        )
      }
      const start =
        fromOpt && isVecLike(fromOpt[key])
          ? toVector(fromOpt[key])
          : toVector(current)
      tracks.push({ key, kind: "vector", from: start, to: toVector(end) })
    } else if (isColorLike(end)) {
      if (!isColorLike(current)) {
        throw new Error(
          `tween: "to.${key}" is a Color but target.${key} is not. The target property must already be a Color (for example material.color) to tween it as a color.`
        )
      }
      const start =
        fromOpt && isColorLike(fromOpt[key])
          ? toColor(fromOpt[key])
          : toColor(current)
      tracks.push({ key, kind: "color", from: start, to: toColor(end) })
    } else if (typeof end === "number") {
      if (fromOpt && typeof fromOpt[key] === "number") {
        tracks.push({ key, kind: "number", from: fromOpt[key], to: end })
      } else if (typeof current === "number") {
        tracks.push({ key, kind: "number", from: current, to: end })
      } else {
        throw new Error(
          `tween: "to.${key}" is a number but target.${key} is ${typeof current}. The property must exist and hold a number to tween it.`
        )
      }
    } else {
      throw new Error(
        `tween: "to.${key}" must be a number, a Vector3 or a Color; got ${typeof end}.`
      )
    }
  }

  // Apply an explicit `from` immediately, so the first rendered frame matches.
  if (fromOpt) {
    for (const track of tracks) {
      const start = fromOpt[track.key]
      if (start === undefined) continue
      if (track.kind === "number") target[track.key] = track.from
      else if (track.kind === "vector") target[track.key].copy(track.from)
      else target[track.key].copy(track.from)
    }
  }

  let elapsed = 0
  let started = false
  let finished = false
  let cancelled = false
  let progress = 0

  function applyTracks(e) {
    for (const track of tracks) {
      if (track.kind === "number") {
        target[track.key] = lerp(track.from, track.to, e)
      } else if (track.kind === "vector") {
        target[track.key].copy(track.from).lerp(track.to, e)
      } else {
        target[track.key].copy(track.from).lerp(track.to, e)
      }
    }
  }

  /** Applies the value the tween rests on and completes it exactly once. */
  function complete() {
    const lastCycle = Math.max(0, totalCycles - 1)
    const endAtStart = yoyo && lastCycle % 2 === 1
    applyTracks(endAtStart ? 0 : 1)
    finished = true
    entry.done = true
    progress = 1
    if (onComplete) onComplete(handle)
  }

  function step(dt) {
    if (finished || cancelled) return
    elapsed += dt
    if (!started) {
      if (elapsed < delay) return
      started = true
      if (onStart) onStart(handle)
    }
    const raw = elapsed - delay
    if (duration <= 0) {
      complete()
      return
    }
    const cycle = Math.floor(raw / duration)
    if (cycle >= totalCycles) {
      complete()
      return
    }
    let p = (raw - cycle * duration) / duration
    if (yoyo && cycle % 2 === 1) p = 1 - p
    progress = (cycle + p) / totalCycles
    applyTracks(easeFn(p))
    if (onUpdate) onUpdate(p, handle)
  }

  const entry = register(step)

  const handle = {
    stop() {
      if (finished || cancelled) return
      cancelled = true
      entry.done = true
    },
    finish() {
      if (finished || cancelled) return
      complete()
    },
    get progress() {
      return cancelled
        ? Math.min(progress, 1)
        : finished
          ? 1
          : clamp(progress, 0, 1)
    },
    get done() {
      return finished || cancelled
    },
  }

  return handle
}

/**
 * Plays tween option objects one after another.
 *
 * Each step is an options object shaped exactly like `tween(target, o)`'s
 * second argument plus its own `target`. The next step starts when the
 * previous one completes; a stopped or unfinished chain can be fast-forwarded
 * with `finish()`.
 *
 * @param {Array<object>} steps Non-empty array of step options, each with `target` and `to` (plus any `tween` options).
 * @returns {{ stop: () => void, finish: () => void, progress: number, done: boolean }} handle — same shape as `tween`'s handle; `progress` spans the whole chain.
 * @throws {Error} When `steps` is not a non-empty array.
 */
export function tweenChain(steps) {
  if (!Array.isArray(steps) || steps.length === 0) {
    throw new Error(
      'tweenChain: "steps" must be a non-empty array of tween option objects, e.g. [{ target, to: { y: 2 }, duration: 0.3 }, ...].'
    )
  }

  let index = 0
  let current = null
  let completedSteps = 0
  let finished = false
  let cancelled = false
  let finishing = false

  function onStepComplete() {
    if (finishing) return
    completedSteps = index + 1
    index += 1
    playNext()
  }

  function playNext() {
    if (index >= steps.length) {
      finished = true
      entry.done = true
      current = null
      return
    }
    const opts = steps[index] || {}
    current = tween(opts.target, {
      ...opts,
      onComplete: onStepComplete,
    })
  }

  const entry = register(function chainStep() {
    // The child tweens drive themselves through the same shared list; this
    // entry only exists so the chain handle participates in bookkeeping.
  })

  playNext()

  const handle = {
    stop() {
      if (finished || cancelled) return
      cancelled = true
      if (current) current.stop()
      entry.done = true
    },
    finish() {
      if (finished || cancelled) return
      finishing = true
      if (current) current.finish()
      while (index < steps.length) {
        const opts = steps[index] || {}
        tween(opts.target, opts).finish()
        index += 1
      }
      finishing = false
      finished = true
      completedSteps = steps.length
      current = null
      entry.done = true
    },
    get progress() {
      if (finished) return 1
      if (cancelled) return Math.min(completedSteps / steps.length, 1)
      const within = current ? current.progress : 0
      return clamp((completedSteps + within) / steps.length, 0, 1)
    },
    get done() {
      return finished || cancelled
    },
  }

  return handle
}

// --- spring -----------------------------------------------------------------

/**
 * Spring-animates `target[prop]` towards `value` with real physics.
 *
 * Uses a damped harmonic oscillator integrated in sub-steps, so it settles
 * with a natural overshoot instead of an easing curve. Works on numeric
 * properties and on Vector3 properties (each axis springs independently).
 *
 * @param {object} target Object owning the property (a mesh, a Vector3...).
 * @param {string} prop Property name, e.g. `"position"` or `"y"`.
 * @param {number|object} value Destination value: a number, or a Vector3-like for vector properties.
 * @param {object} [o] Options; unknown keys are ignored.
 * @param {number} [o.stiffness=100] Spring strength; higher snaps faster and overshoots less relative to travel.
 * @param {number} [o.damping=10] Velocity damping; low values bounce for longer, high values crawl.
 * @param {number} [o.restDelta=0.001] Distance (per axis) below which the spring is considered settled.
 * @param {function} [o.onComplete] `fn(handle)` once, when the spring settles.
 * @returns {{ stop: () => void, finish: () => void, progress: number, done: boolean, update: (dt: number) => void }} handle —
 *   same shape as `tween`'s handle, plus `update(dt)` if you drive it manually
 *   instead of through `tweenSystem`.
 * @throws {Error} When `target` is not an object, `prop` is missing from it, or `value` is not a number / Vector3-like.
 */
export function spring(target, prop, value, o = {}) {
  if (target === null || typeof target !== "object") {
    throw new Error(
      'spring: "target" must be an object to animate (for example a mesh or a Vector3).'
    )
  }
  if (typeof prop !== "string" || !(prop in target)) {
    throw new Error(
      `spring: "prop" must be the name of an existing property on target (for example "position"); got ${String(prop)}.`
    )
  }
  const stiffness = Math.max(0, num(o.stiffness, 100))
  const damping = Math.max(0, num(o.damping, 10))
  const restDelta = Math.max(0, num(o.restDelta, 0.001))
  const onComplete = typeof o.onComplete === "function" ? o.onComplete : null

  const currentProp = target[prop]
  const vector = isVecLike(value) || isVecLike(currentProp)
  if (vector) {
    if (!isVecLike(value) || !isVecLike(currentProp)) {
      throw new Error(
        `spring: target.${prop} and value must both be Vector3-like to spring a vector property; got ${typeof value}.`
      )
    }
  } else if (typeof value !== "number" || typeof currentProp !== "number") {
    throw new Error(
      `spring: "value" must be a number to spring the numeric property "${prop}"; got ${typeof value}.`
    )
  }

  const goal = vector ? toVector(value) : value
  let vel = vector ? new THREE.Vector3() : 0
  const startDist = vector
    ? currentProp.distanceTo(goal)
    : Math.abs(currentProp - goal)
  let settled = false
  let finished = false
  let cancelled = false
  let progress = startDist > 1e-9 ? 0 : 1

  const MAX_SUB_DT = 1 / 120 // Keep semi-implicit Euler stable on long frames.
  const MAX_SUBSTEPS = 8

  function isAtRest() {
    if (vector) {
      return (
        Math.abs(currentProp.x - goal.x) < restDelta &&
        Math.abs(currentProp.y - goal.y) < restDelta &&
        Math.abs(currentProp.z - goal.z) < restDelta &&
        vel.lengthSq() < restDelta * 10 * (restDelta * 10)
      )
    }
    return (
      Math.abs(currentProp - goal) < restDelta && Math.abs(vel) < restDelta * 10
    )
  }

  function snapToGoal() {
    if (vector) currentProp.copy(goal)
    else target[prop] = goal
  }

  function step(dt) {
    if (finished || cancelled || settled) return
    const frame = dt > 0 ? dt : 0
    const substeps = Math.min(
      MAX_SUBSTEPS,
      Math.max(1, Math.ceil(frame / MAX_SUB_DT))
    )
    const h = frame / substeps
    for (let i = 0; i < substeps; i++) {
      if (vector) {
        vel.x += (-stiffness * (currentProp.x - goal.x) - damping * vel.x) * h
        vel.y += (-stiffness * (currentProp.y - goal.y) - damping * vel.y) * h
        vel.z += (-stiffness * (currentProp.z - goal.z) - damping * vel.z) * h
        currentProp.x += vel.x * h
        currentProp.y += vel.y * h
        currentProp.z += vel.z * h
      } else {
        vel += (-stiffness * (currentProp - goal) - damping * vel) * h
        currentProp += vel * h
      }
    }
    const dist = vector
      ? currentProp.distanceTo(goal)
      : Math.abs(currentProp - goal)
    progress = startDist > 1e-9 ? clamp(1 - dist / startDist, 0, 1) : 1
    if (isAtRest()) {
      snapToGoal()
      settled = true
      finished = true
      entry.done = true
      progress = 1
      if (onComplete) onComplete(handle)
    }
  }

  const entry = register(step)

  const handle = {
    update: step,
    stop() {
      if (finished || cancelled) return
      cancelled = true
      entry.done = true
    },
    finish() {
      if (finished || cancelled) return
      snapToGoal()
      finished = true
      entry.done = true
      progress = 1
      if (onComplete) onComplete(handle)
    },
    get progress() {
      return cancelled ? Math.min(progress, 1) : finished ? 1 : progress
    },
    get done() {
      return finished || cancelled
    },
  }

  return handle
}

// --- juice helpers ----------------------------------------------------------

/**
 * Decaying random-ish position shake around the target's current position.
 *
 * The base position is captured when the shake is created and restored
 * exactly when it ends or is stopped. Drive it through `tweenSystem`.
 *
 * @param {object} target Object with a Vector3 `position` (usually a mesh or camera).
 * @param {object} [o] Options; unknown keys are ignored.
 * @param {number} [o.strength=0.3] Peak offset amplitude in world units.
 * @param {number} [o.duration=0.4] Seconds until the shake fully decays.
 * @param {number} [o.frequency=30] Oscillation speed; higher rattles faster.
 * @returns {{ stop: () => void, finish: () => void, progress: number, done: boolean }} handle — `finish()`/`stop()` both restore the base position immediately.
 * @throws {Error} When `target` has no Vector3-like `position`.
 */
export function shake(target, o = {}) {
  if (!target || !isVecLike(target.position)) {
    throw new Error(
      'shake: "target" must be an object with a Vector3 position (for example a mesh or camera), so it can be rattled in place.'
    )
  }
  const strength = Math.max(0, num(o.strength, 0.3))
  const duration = Math.max(0.001, num(o.duration, 0.4))
  const frequency = Math.max(0.001, num(o.frequency, 30))
  const base = toVector(target.position)
  let age = 0
  let finished = false
  let cancelled = false

  function restore() {
    target.position.copy(base)
  }

  const entry = register(function step(dt) {
    if (finished || cancelled) return
    age += dt
    if (age >= duration) {
      restore()
      finished = true
      entry.done = true
      return
    }
    const decay = 1 - age / duration
    const t = age * frequency
    // Layered sines with irrational-ish multipliers read as random without a rng.
    const nx = Math.sin(t * 12.9) * 0.6 + Math.sin(t * 27.1 + 1.7) * 0.4
    const ny = Math.sin(t * 15.7 + 0.9) * 0.6 + Math.sin(t * 31.3 + 4.2) * 0.4
    const nz = Math.sin(t * 11.3 + 2.6) * 0.6 + Math.sin(t * 24.7 + 5.1) * 0.4
    target.position.set(
      base.x + nx * strength * decay,
      base.y + ny * strength * decay,
      base.z + nz * strength * decay
    )
  })

  const handle = {
    stop() {
      if (finished || cancelled) return
      cancelled = true
      entry.done = true
      restore()
    },
    finish() {
      if (finished || cancelled) return
      finished = true
      entry.done = true
      restore()
    },
    get progress() {
      return finished || cancelled ? 1 : clamp(age / duration, 0, 1)
    },
    get done() {
      return finished || cancelled
    },
  }

  return handle
}

/**
 * Pops an object in: scales it up from (near) zero with a springy ease.
 *
 * The scale is captured when called, so non-uniform scales are preserved, and
 * `visible` is turned on so a previously popped-out object reappears.
 *
 * @param {object} target Object with a Vector3 `scale` (usually a mesh or group).
 * @param {object} [o] Options; unknown keys are ignored.
 * @param {number} [o.from=0] Scale multiplier to start from.
 * @param {number} [o.to=1] Scale multiplier to end at (`1` = the captured scale).
 * @param {number} [o.duration=0.3] Seconds the pop takes.
 * @param {number} [o.delay=0] Seconds to wait before popping.
 * @param {string|function} [o.ease="backOut"] Easing name or custom curve.
 * @param {function} [o.onComplete] `fn(handle)` once, when the pop ends.
 * @returns {{ stop: () => void, finish: () => void, progress: number, done: boolean }} handle — same shape as `tween`'s handle.
 * @throws {Error} When `target` has no Vector3-like `scale`.
 */
export function popIn(target, o = {}) {
  if (!target || !isVecLike(target.scale)) {
    throw new Error(
      'popIn: "target" must be an object with a Vector3 scale (for example a mesh or group), so it can grow from zero.'
    )
  }
  const sx = target.scale.x
  const sy = target.scale.y
  const sz = target.scale.z
  const from = num(o.from, 0)
  const to = num(o.to, 1)
  if ("visible" in target) target.visible = true
  return tween(target.scale, {
    duration: num(o.duration, 0.3),
    delay: num(o.delay, 0),
    ease: o.ease === undefined ? "backOut" : o.ease,
    from: { x: sx * from, y: sy * from, z: sz * from },
    to: { x: sx * to, y: sy * to, z: sz * to },
    onComplete: o.onComplete,
  })
}

/**
 * Pops an object out: scales it down towards zero, then hides it.
 *
 * The inverse of `popIn` — `onComplete` fires after `visible` is set to
 * `false`, so the object is ready to be reused or popped back in.
 *
 * @param {object} target Object with a Vector3 `scale` (usually a mesh or group).
 * @param {object} [o] Options; unknown keys are ignored.
 * @param {number} [o.from] Scale multiplier to start from; defaults to `1` (the captured scale).
 * @param {number} [o.to=0] Scale multiplier to end at.
 * @param {number} [o.duration=0.3] Seconds the pop takes.
 * @param {number} [o.delay=0] Seconds to wait before popping.
 * @param {string|function} [o.ease="cubicIn"] Easing name or custom curve.
 * @param {function} [o.onComplete] `fn(handle)` once, after the object is hidden.
 * @returns {{ stop: () => void, finish: () => void, progress: number, done: boolean }} handle — same shape as `tween`'s handle.
 * @throws {Error} When `target` has no Vector3-like `scale`.
 */
export function popOut(target, o = {}) {
  if (!target || !isVecLike(target.scale)) {
    throw new Error(
      'popOut: "target" must be an object with a Vector3 scale (for example a mesh or group), so it can shrink to zero.'
    )
  }
  const sx = target.scale.x
  const sy = target.scale.y
  const sz = target.scale.z
  const from = num(o.from, 1)
  const to = num(o.to, 0)
  const userComplete = typeof o.onComplete === "function" ? o.onComplete : null
  return tween(target.scale, {
    duration: num(o.duration, 0.3),
    delay: num(o.delay, 0),
    ease: o.ease === undefined ? "cubicIn" : o.ease,
    from: { x: sx * from, y: sy * from, z: sz * from },
    to: { x: sx * to, y: sy * to, z: sz * to },
    onComplete(handle) {
      if ("visible" in target) target.visible = false
      if (userComplete) userComplete(handle)
    },
  })
}

/**
 * Bounces an object up and down around its current height.
 *
 * Each cycle lifts `position.y` by up to `height` world units along a
 * parabolic arc and lands back on the captured base height. Runs forever
 * until stopped unless `times` limits it.
 *
 * @param {object} obj Object with a Vector3 `position` (usually a mesh).
 * @param {object} [o] Options; unknown keys are ignored.
 * @param {number} [o.height=1] Peak height above the captured base, in world units.
 * @param {number} [o.duration=0.6] Seconds per bounce cycle.
 * @param {number} [o.times=Infinity] Total number of bounces before settling.
 * @returns {{ stop: () => void, finish: () => void, progress: number, done: boolean }} handle — `finish()`/`stop()` drop the object back to its base height.
 * @throws {Error} When `obj` has no Vector3-like `position`.
 */
export function bounce(obj, o = {}) {
  if (!obj || !isVecLike(obj.position)) {
    throw new Error(
      'bounce: "obj" must be an object with a Vector3 position (for example a mesh), so it can hop in place.'
    )
  }
  const height = num(o.height, 1)
  const duration = Math.max(0.01, num(o.duration, 0.6))
  const times = Math.max(0, numOrInf(o.times, Infinity))
  const baseY = obj.position.y
  let age = 0
  let finished = false
  let cancelled = false

  function restore() {
    obj.position.y = baseY
  }

  const entry = register(function step(dt) {
    if (finished || cancelled) return
    age += dt
    const cycle = age / duration
    if (cycle >= times) {
      restore()
      finished = true
      entry.done = true
      return
    }
    const p = cycle % 1
    obj.position.y = baseY + height * 4 * p * (1 - p)
  })

  const handle = {
    stop() {
      if (finished || cancelled) return
      cancelled = true
      entry.done = true
      restore()
    },
    finish() {
      if (finished || cancelled) return
      finished = true
      entry.done = true
      restore()
    },
    get progress() {
      if (finished || cancelled) return 1
      return times === Infinity ? 0 : clamp(age / (times * duration), 0, 1)
    },
    get done() {
      return finished || cancelled
    },
  }

  return handle
}
