// Camera rigs and cinematic helpers for the seeded runtime.
//
// A rig owns its camera's framing: the follow rig trails a moving target, the
// orbit rig circles a fixed point under pointer drag and wheel zoom, and the
// shake/transition helpers layer on top of any camera. Every rig is safe to
// add with `game.addSystem(rig)` (its `update(dt, elapsed)` drives the camera)
// and `dispose()` detaches its listeners.
//
// No side effects at import time: listeners attach only when a factory runs.

import * as THREE from "three"

import { clamp, damp, easings } from "./math.js"

/** Finite-number option lookup with a fallback default. */
function num(value, fallback) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback
}

/** Copies any Vector3-like option into a fresh THREE.Vector3. */
function toVector(v) {
  return new THREE.Vector3(v.x, v.y, v.z)
}

/** True when `v` looks like a Vector3 (has numeric x/y/z). */
function isVecLike(v) {
  return (
    v !== null &&
    typeof v === "object" &&
    typeof v.x === "number" &&
    typeof v.y === "number" &&
    typeof v.z === "number"
  )
}

/** Reads a Vector3-like option, falling back to `fallback`. */
function vecOr(v, fallback) {
  return isVecLike(v) ? toVector(v) : fallback
}

// --- follow rig ---------------------------------------------------------------

/**
 * Creates a follow camera: it trails `target` from a fixed offset, smoothed
 * with frame-rate independent damping, and can lean ahead of the target's
 * motion with `lookAhead`.
 *
 * Attach with `game.addSystem(rig)` (or call `rig.update(dt)` yourself). The
 * camera's `lookAt` is driven every frame, so nothing else should move it
 * while the rig is live.
 *
 * @param {THREE.Camera} camera Camera the rig drives.
 * @param {object} [o] Options; unknown keys are ignored.
 * @param {THREE.Object3D|object} [o.target] Object to follow; anything with a Vector3 `position`.
 * @param {object} [o.offset={x:0,y:8,z:10}] Camera offset from the target's position, Vector3-like.
 * @param {object} [o.lookOffset={x:0,y:1,z:0}] Point (relative to the target) the camera looks at, Vector3-like.
 * @param {number} [o.lag=4] Smoothing rate for position following; higher = tighter.
 * @param {number} [o.lookAhead=0] World units the camera leads in the target's velocity direction.
 * @returns {object} rig — members:
 *   `target` (current follow target or `null`),
 *   `setTarget(o)` — switches (or clears, `null`) the follow target instantly; no snap;
 *   `update(dt)` — per-frame follow logic, safe before `setTarget`,
 *   `dispose()` — detaches the rig (clears callbacks); the camera itself is untouched.
 */
export function createFollowRig(camera, o = {}) {
  if (!camera || typeof camera.position === "undefined") {
    throw new Error(
      "createFollowRig: pass a THREE.Camera, e.g. createFollowRig(new THREE.PerspectiveCamera(60, 1, 0.1, 1000))."
    )
  }
  const offset = vecOr(o.offset, new THREE.Vector3(0, 8, 10))
  const lookOffset = vecOr(o.lookOffset, new THREE.Vector3(0, 1, 0))
  const lag = Math.max(0, num(o.lag, 4))
  const lookAhead = Math.max(0, num(o.lookAhead, 0))

  let target = o.target || null
  const desired = new THREE.Vector3()
  const lookAt = new THREE.Vector3()
  const lastTargetPos = new THREE.Vector3()
  if (isVecLike(target?.position)) lastTargetPos.copy(target.position)
  const velocity = new THREE.Vector3()

  const rig = {
    get target() {
      return target
    },
    setTarget(next) {
      target = next || null
      if (isVecLike(target?.position)) {
        lastTargetPos.copy(target.position)
      } else {
        lastTargetPos.set(0, 0, 0)
      }
      velocity.set(0, 0, 0)
    },
    update(dt) {
      if (!target || !isVecLike(target.position)) return
      const step = num(dt, 0)

      // Estimate target velocity from its position delta (for lookAhead).
      if (step > 0) {
        velocity.set(
          (target.position.x - lastTargetPos.x) / step,
          (target.position.y - lastTargetPos.y) / step,
          (target.position.z - lastTargetPos.z) / step
        )
        lastTargetPos.copy(target.position)
      }

      desired.copy(offset).add(target.position)
      camera.position.x = damp(camera.position.x, desired.x, lag, step)
      camera.position.y = damp(camera.position.y, desired.y, lag, step)
      camera.position.z = damp(camera.position.z, desired.z, lag, step)

      lookAt.copy(lookOffset).add(target.position)
      if (lookAhead > 0) {
        lookAt.addScaledVector(
          velocity,
          Math.min(lookAhead / Math.max(velocity.length(), 1e-6), 1)
        )
      }
      camera.lookAt(lookAt)
    },
    dispose() {
      target = null
    },
  }

  return rig
}

// --- orbit rig ------------------------------------------------------------------

/**
 * Creates an orbit camera: it circles `target` at `distance`, controlled by
 * pointer drag (yaw/pitch) and mouse wheel (zoom), both smoothed with damping.
 *
 * Attach with `game.addSystem(rig)`. Listeners attach to `options.domElement`
 * (or `window`) only when this factory runs, and `dispose()` removes them.
 *
 * @param {THREE.Camera} camera Camera the rig drives.
 * @param {object} [o] Options; unknown keys are ignored.
 * @param {object} [o.target={x:0,y:0,z:0]] Point to orbit around, Vector3-like.
 * @param {number} [o.distance=10] Starting distance from the target.
 * @param {number} [o.minDistance=2] Closest allowed zoom distance.
 * @param {number} [o.maxDistance=50] Farthest allowed zoom distance.
 * @param {number} [o.damping=8] Smoothing rate for drag rotation and zoom; higher = snappier.
 * @param {number} [o.minPolarAngle=0.1] Lowest camera elevation angle, radians (0 = straight above).
 * @param {number} [o.maxPolarAngle=Math.PI/2.1] Highest camera elevation angle, radians (PI/2 = horizon).
 * @param {number} [o.rotateSpeed=1] Drag sensitivity multiplier.
 * @param {number} [o.zoomSpeed=1] Wheel sensitivity multiplier.
 * @param {HTMLElement|Window} [o.domElement] Element the pointer/wheel listeners attach to; defaults to `window`.
 * @param {boolean} [o.zoom=true] Enable wheel zooming.
 * @returns {object} rig — members:
 *   `target` — the orbit center Vector3 (mutate it to move the rig);
 *   `distance`, `minDistance`, `maxDistance` — live zoom settings;
 *   `update(dt)` — per-frame orbit logic (required for damping);
 *   `dispose()` — removes listeners.
 */
export function createOrbitRig(camera, o = {}) {
  if (!camera || typeof camera.position === "undefined") {
    throw new Error(
      "createOrbitRig: pass a THREE.Camera, e.g. createOrbitRig(new THREE.PerspectiveCamera(60, 1, 0.1, 1000))."
    )
  }
  const target = vecOr(o.target, new THREE.Vector3(0, 0, 0))
  const damping = Math.max(0.001, num(o.damping, 8))
  const rotateSpeed = num(o.rotateSpeed, 1)
  const zoomSpeed = num(o.zoomSpeed, 1)
  const zoomEnabled = o.zoom !== false
  const domElement =
    o.domElement || (typeof window !== "undefined" ? window : null)

  const MIN_POLAR = num(o.minPolarAngle, 0.1)
  const MAX_POLAR = num(o.maxPolarAngle, Math.PI / 2.1)
  const minDistance = Math.max(0.01, num(o.minDistance, 2))
  const maxDistance = Math.max(minDistance, num(o.maxDistance, 50))

  let distance = clamp(num(o.distance, 10), minDistance, maxDistance)
  let desiredDistance = distance

  // Spherical coords around the target: yaw (azimuth) and pitch (polar).
  let yaw = 0
  let pitch = (MIN_POLAR + MAX_POLAR) / 2
  let desiredYaw = yaw
  let desiredPitch = pitch

  // Initialize yaw/pitch from the camera's current position, so the rig picks
  // up where the camera already is instead of snapping to a default angle.
  const initial = new THREE.Vector3().copy(camera.position).sub(target)
  if (initial.lengthSq() > 1e-10) {
    const r = initial.length()
    desiredPitch = clamp(
      Math.acos(clamp(initial.y / r, -1, 1)),
      MIN_POLAR,
      MAX_POLAR
    )
    desiredYaw = Math.atan2(initial.x, initial.z)
    yaw = desiredYaw
    pitch = desiredPitch
    distance = clamp(r, minDistance, maxDistance)
    desiredDistance = distance
  }

  let dragging = false
  let lastX = 0
  let lastY = 0
  let disposed = false

  function onPointerDown(event) {
    if (event.button !== 0 && event.pointerType === "mouse") return
    dragging = true
    lastX = event.clientX
    lastY = event.clientY
  }

  function onPointerMove(event) {
    if (!dragging) return
    const dx = event.clientX - lastX
    const dy = event.clientY - lastY
    lastX = event.clientX
    lastY = event.clientY
    desiredYaw -= dx * 0.005 * rotateSpeed
    desiredPitch = clamp(
      desiredPitch - dy * 0.005 * rotateSpeed,
      MIN_POLAR,
      MAX_POLAR
    )
  }

  function onPointerUp() {
    dragging = false
  }

  function onWheel(event) {
    if (!zoomEnabled) return
    const delta = typeof event.deltaY === "number" ? event.deltaY : 0
    desiredDistance = clamp(
      desiredDistance * (1 + delta * 0.001 * zoomSpeed),
      minDistance,
      maxDistance
    )
  }

  if (domElement && typeof domElement.addEventListener === "function") {
    domElement.addEventListener("pointerdown", onPointerDown)
    domElement.addEventListener("pointermove", onPointerMove)
    domElement.addEventListener("pointerup", onPointerUp)
    domElement.addEventListener("pointercancel", onPointerUp)
    domElement.addEventListener("wheel", onWheel, { passive: true })
  }

  const spherical = new THREE.Vector3()

  const rig = {
    target,
    get distance() {
      return distance
    },
    set distance(v) {
      distance = clamp(num(v, distance), minDistance, maxDistance)
      desiredDistance = distance
    },
    minDistance,
    maxDistance,
    update(dt) {
      if (disposed) return
      const step = num(dt, 0)
      yaw = damp(yaw, desiredYaw, damping, step)
      pitch = damp(pitch, desiredPitch, damping, step)
      distance = damp(distance, desiredDistance, damping, step)

      const sinPitch = Math.sin(pitch)
      spherical.set(
        distance * sinPitch * Math.sin(yaw),
        distance * Math.cos(pitch),
        distance * sinPitch * Math.cos(yaw)
      )
      camera.position.copy(target).add(spherical)
      camera.lookAt(target)
    },
    dispose() {
      if (disposed) return
      disposed = true
      if (domElement && typeof domElement.removeEventListener === "function") {
        domElement.removeEventListener("pointerdown", onPointerDown)
        domElement.removeEventListener("pointermove", onPointerMove)
        domElement.removeEventListener("pointerup", onPointerUp)
        domElement.removeEventListener("pointercancel", onPointerUp)
        domElement.removeEventListener("wheel", onWheel)
      }
    },
  }

  return rig
}

// --- camera shake -------------------------------------------------------------

/**
 * Adds decaying random shake to a camera, layered on top of whatever else
 * moves it. Shakes are additive: the shaker remembers the offset it applied
 * last frame, removes it, then applies the new one, so it composes cleanly
 * with a follow rig or transition that runs earlier in the system list.
 *
 * @param {THREE.Camera} camera Camera to rattle.
 * @returns {object} shaker — members:
 *   `add(amount, duration)` — starts one shake; `amount` is peak offset in world units, `duration` in seconds (defaults `0.3` / `0.4`);
 *   `update(dt)` — per-frame shake logic; register the returned shaker with `game.addSystem` (after any rig) or call it yourself;
 *   `dispose()` — removes the pending offset and clears all live shakes.
 */
export function cameraShake(camera) {
  if (!camera || typeof camera.position === "undefined") {
    throw new Error(
      "cameraShake: pass a THREE.Camera, e.g. cameraShake(game.camera)."
    )
  }
  const offset = new THREE.Vector3()
  const prevOffset = new THREE.Vector3()
  let hasPrev = false
  /** @type {Array<{ amount: number, duration: number, age: number }>} */
  const shakes = []
  let disposed = false

  return {
    add(amount, duration) {
      if (disposed) return
      shakes.push({
        amount: Math.max(0, num(amount, 0.3)),
        duration: Math.max(0.001, num(duration, 0.4)),
        age: 0,
      })
    },
    update(dt) {
      if (disposed) return
      const step = num(dt, 0)
      // Undo the last offset this shaker applied, then re-apply fresh. This
      // composes with any other mover (follow rig, transition) that runs
      // before it in the system list: it never resets the camera, it only
      // adds and removes its own wiggle.
      if (hasPrev) camera.position.sub(prevOffset)
      offset.set(0, 0, 0)
      for (let i = shakes.length - 1; i >= 0; i--) {
        const s = shakes[i]
        s.age += step
        if (s.age >= s.duration) {
          shakes.splice(i, 1)
          continue
        }
        const decay = 1 - s.age / s.duration
        const t = s.age * 40
        offset.x += Math.sin(t * 12.9) * s.amount * decay
        offset.y += Math.sin(t * 15.7 + 0.9) * s.amount * decay
        offset.z += Math.sin(t * 11.3 + 2.6) * s.amount * decay
      }
      camera.position.add(offset)
      prevOffset.copy(offset)
      hasPrev = true
    },
    dispose() {
      if (disposed) return
      disposed = true
      if (hasPrev) camera.position.sub(prevOffset)
      hasPrev = false
      shakes.length = 0
    },
  }
}

// --- transition -----------------------------------------------------------------

/**
 * Tweens a camera to a new position and look-at point over `duration`.
 *
 * The start pose is captured when the transition is created; `onUpdate`
 * (optional) fires every frame with the eased progress. On completion the
 * camera rests exactly at `position`, looking at `lookAt`.
 *
 * @param {THREE.Camera} camera Camera to move.
 * @param {object} [o] Options; unknown keys are ignored.
 * @param {object} [o.position] Destination position, Vector3-like (defaults to the camera's current position).
 * @param {object} [o.lookAt] Destination look-at point, Vector3-like (defaults to the camera's current look direction, 1 unit ahead).
 * @param {number} [o.duration=1] Seconds the move takes.
 * @param {string|function} [o.ease="cubicInOut"] Easing name (see `math.js` `easings`) or a custom `(t) => number` curve.
 * @param {function} [o.onUpdate] `fn(p, handle)` every frame; `p` is eased progress in `[0, 1]`.
 * @returns {{ stop: () => void, finish: () => void, progress: number, done: boolean }} handle —
 *   `stop()` freezes the camera mid-flight; `finish()` jumps to the destination;
 *   `progress` is completion in `[0, 1]`; `done` is `true` once finished or stopped.
 */
export function transition(camera, o = {}) {
  if (!camera || typeof camera.position === "undefined") {
    throw new Error(
      "transition: pass a THREE.Camera, e.g. transition(camera, { position: { x: 0, y: 5, z: 10 }, lookAt: { x: 0, y: 0, z: 0 } })."
    )
  }
  const startPos = camera.position.clone()
  camera.updateMatrixWorld()
  const startLook = new THREE.Vector3()
  camera.getWorldDirection(startLook).add(camera.position)
  const endPos = vecOr(o.position, startPos.clone())
  const endLook = vecOr(o.lookAt, startLook)
  const duration = Math.max(0, num(o.duration, 1))
  const easeName =
    o.ease === undefined || o.ease === null ? "cubicInOut" : o.ease
  const onUpdate = typeof o.onUpdate === "function" ? o.onUpdate : null

  let easeFn
  if (typeof easeName === "function") {
    easeFn = easeName
  } else if (Object.prototype.hasOwnProperty.call(easings, easeName)) {
    easeFn = (t) => easings[easeName](clamp(t, 0, 1))
  } else {
    throw new Error(
      `transition: unknown easing "${String(easeName)}". Use one of: ${Object.keys(easings).join(", ")}, or pass a (t) => number function.`
    )
  }

  let age = 0
  let finished = false
  let cancelled = false
  let progress = 0

  function apply(p) {
    camera.position.lerpVectors(startPos, endPos, p)
    _lookTmp.lerpVectors(startLook, endLook, p)
    camera.lookAt(_lookTmp)
  }

  const _lookTmp = new THREE.Vector3()

  const entry = { done: false }

  /**
   * Advances the transition by `dt` seconds. Per the kit convention, the
   * handle itself is the system: add it with `game.addSystem(handle)` or call
   * `handle.update(dt)` each frame.
   *
   * @param {number} dt Seconds since the last call.
   * @returns {void}
   */
  function step(dt) {
    if (finished || cancelled) return
    age += num(dt, 0)
    if (duration <= 0 || age >= duration) {
      apply(1)
      finished = true
      entry.done = true
      progress = 1
      return
    }
    progress = clamp(age / duration, 0, 1)
    apply(easeFn(progress))
    if (onUpdate) onUpdate(progress, handle)
  }

  // The transition drives itself off the returned handle (see `step`), so the
  // game loop never needs a shared ticker for it.
  const handle = {
    update: step,
    stop() {
      if (finished || cancelled) return
      cancelled = true
      entry.done = true
    },
    finish() {
      if (finished || cancelled) return
      apply(1)
      finished = true
      entry.done = true
      progress = 1
      if (onUpdate) onUpdate(1, handle)
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
