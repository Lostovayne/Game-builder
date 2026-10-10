// Axis-aligned physics world for the seeded runtime: boxes, spheres and
// planes, swept by fixed sub-steps. Rotations are never simulated — an
// object's `rotation` stays exactly as the caller left it and is visual only.
//
// No side effects at import time: everything happens inside `createWorld` or
// on the world it returns.

import * as THREE from "three"

import { clamp } from "./math.js"

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

// --- primitive extents ------------------------------------------------------

/**
 * A body's half extents along each axis, plus its bounding radius.
 * Boxes use `size * 0.5`; spheres use `radius` on every axis; planes have
 * infinite extents on x/z and a thin half-height on y (so they collide from
 * both sides near y = 0).
 * @param {object} body Body to size.
 * @returns {{ hx: number, hy: number, hz: number, radius: number }} Half extents.
 */
function extents(body) {
  if (body.shape === "sphere") {
    return {
      hx: body.radius,
      hy: body.radius,
      hz: body.radius,
      radius: body.radius,
    }
  }
  if (body.shape === "plane") {
    return { hx: Infinity, hy: 0.001, hz: Infinity, radius: Infinity }
  }
  return {
    hx: body.size.x * 0.5,
    hy: body.size.y * 0.5,
    hz: body.size.z * 0.5,
    radius: body.boundRadius,
  }
}

// --- collision callbacks ----------------------------------------------------

/**
 * Fires `fn(a, b, contact)` whenever two bodies start (or keep) overlapping.
 *
 * @param {object} a First overlapping body.
 * @param {object} b Second overlapping body.
 * @param {{ normal: THREE.Vector3, depth: number }} contact Contact info; `normal` points from `b` towards `a`, `depth` is the overlap amount.
 * @returns {void}
 */
function fireCollision(a, b, contact) {
  if (a.onCollide) a.onCollide(a, b, contact)
  if (b.onCollide)
    b.onCollide(b, a, {
      normal: contact.normal.clone().negate(),
      depth: contact.depth,
    })
}

// --- body -------------------------------------------------------------------

/**
 * Validates and normalizes one body spec into an internal body record.
 * Every numeric option is coerced or defaulted here, once, so the step loop
 * never branches on malformed input.
 *
 * @param {object} spec Caller-supplied spec (see `addBody`).
 * @param {number} defaultRestitution World-level default for `restitution`.
 * @returns {object} Internal body record.
 * @throws {Error} When the spec is missing a shape or its size/radius.
 */
function makeBody(spec, defaultRestitution) {
  if (!spec || typeof spec !== "object") {
    throw new Error(
      'addBody: pass a body spec object, e.g. { shape: "box", size: { x: 1, y: 1, z: 1 }, position: { x: 0, y: 5, z: 0 } }.'
    )
  }
  const shape = spec.shape
  if (shape !== "box" && shape !== "sphere" && shape !== "plane") {
    throw new Error(
      `addBody: "shape" must be "box", "sphere" or "plane"; got ${String(shape)}.`
    )
  }
  if (shape === "plane") {
    // Planes are the ground/ceiling: infinite in x/z, centered on y.
    const position = isVecLike(spec.position)
      ? toVector(spec.position)
      : new THREE.Vector3(0, 0, 0)
    const body = {
      shape,
      size: null,
      radius: 0,
      position,
      velocity: isVecLike(spec.velocity)
        ? toVector(spec.velocity)
        : new THREE.Vector3(),
      mass: 0,
      invMass: 0,
      restitution: num(spec.restitution, defaultRestitution),
      friction: clamp(num(spec.friction, 0.6), 0, 1),
      isStatic: true,
      tag: spec.tag,
      object: spec.object || null,
      onCollide: typeof spec.onCollide === "function" ? spec.onCollide : null,
      boundRadius: Infinity,
      dead: false,
      id: bodyIdCounter++,
      world: null,
      applyImpulse,
      teleport,
      dispose: disposeBody,
    }
    return body
  }

  if (shape === "sphere") {
    const radius = num(spec.radius, 0)
    if (radius <= 0) {
      throw new Error(
        'addBody: sphere bodies need a positive "radius", e.g. { shape: "sphere", radius: 0.5 }.'
      )
    }
  } else {
    const size = isVecLike(spec.size) ? toVector(spec.size) : null
    if (!size || size.x <= 0 || size.y <= 0 || size.z <= 0) {
      throw new Error(
        'addBody: box bodies need a positive "size", e.g. { shape: "box", size: { x: 1, y: 1, z: 1 } }.'
      )
    }
  }

  const isStatic = spec.isStatic === true
  const mass = isStatic ? 0 : Math.max(0, num(spec.mass, 1))
  const position = isVecLike(spec.position)
    ? toVector(spec.position)
    : new THREE.Vector3()
  const size = shape === "box" ? toVector(spec.size) : null
  const radius = shape === "sphere" ? num(spec.radius, 0) : 0

  const invMass = mass > 0 ? 1 / mass : 0
  const boundRadius =
    shape === "sphere"
      ? radius
      : Math.sqrt(size.x * size.x + size.y * size.y + size.z * size.z) / 2

  return {
    shape,
    size,
    radius,
    position,
    velocity: isVecLike(spec.velocity)
      ? toVector(spec.velocity)
      : new THREE.Vector3(),
    mass,
    restitution: num(spec.restitution, defaultRestitution),
    friction: clamp(num(spec.friction, 0.6), 0, 1),
    isStatic,
    tag: spec.tag,
    object: spec.object || null,
    onCollide: typeof spec.onCollide === "function" ? spec.onCollide : null,
    invMass,
    boundRadius,
    dead: false,
    id: bodyIdCounter++,
    world: null,
    applyImpulse,
    teleport,
    dispose: disposeBody,
  }
}

let bodyIdCounter = 0

/**
 * Creates an axis-aligned physics world.
 *
 * `step(dt)` internally runs fixed sub-steps of `fixedStep` seconds (the same
 * accumulator pattern as engine.js), so simulation results do not depend on
 * the caller's frame rate. Bodies never rotate: an attached `spec.object`'s
 * `rotation` is visual only and the simulation never touches it.
 *
 * @param {object} [o] Options; unknown keys are ignored.
 * @param {number} [o.gravity=-20] Downward acceleration in world units per second².
 * @param {number} [o.fixedStep=1/60] Fixed sub-step length in seconds; `step(dt)` replays whole sub-steps.
 * @param {number} [o.restitution=0] Default bounciness (0..1) for bodies that do not set their own.
 * @returns {object} world — members:
 *   `gravity`, `fixedStep` — the resolved options;
 *   `addBody(spec) -> body` — adds a body (see below), throws on invalid specs;
 *   `removeBody(body)` — removes a body (tolerates unknown bodies);
 *   `step(dt)` — advances the simulation by fixed sub-steps;
 *   `onCollision(fn) -> off` — world-level callback `fn(a, b, contact)`, returns an unsubscribe;
 *   `raycast(origin, dir, o) -> hit|null` — analytic ray vs boxes/spheres/planes; `o.maxDistance` (default `Infinity`); hit is `{ body, point, distance, normal }`;
 *   `overlap(box) -> bodies[]` — bodies whose AABBs intersect the `{ min, max }` box;
 *   `bodies` — live array of all bodies (do not mutate);
 *   `dispose()` — clears all bodies and callbacks.
 */
export function createWorld(o = {}) {
  const gravity = num(o.gravity, -20)
  const fixedStep = Math.max(0.001, num(o.fixedStep, 1 / 60))
  const defaultRestitution = clamp(num(o.restitution, 0), 0, 1)

  /** @type {object[]} */
  const bodies = []
  const collisionListeners = new Set()
  let accumulator = 0
  let disposed = false

  const world = {
    gravity,
    fixedStep,
    bodies,
  }

  /**
   * Adds a body to the world.
   *
   * @param {object} spec Body spec; unknown keys are ignored.
   * @param {"box"|"sphere"|"plane"} spec.shape Collider shape (required).
   * @param {object} [spec.size] Box full size `{ x, y, z }` (required for `"box"`).
   * @param {number} [spec.radius] Sphere radius (required for `"sphere"`).
   * @param {object} [spec.position={x:0,y:0,z:0}] Start position, Vector3-like.
   * @param {object} [spec.velocity={x:0,y:0,z:0}] Start velocity, Vector3-like.
   * @param {number} [spec.mass=1] Mass in (arbitrary) units; `0` or `isStatic: true` makes the body immovable.
   * @param {number} [spec.restitution] Bounciness 0..1; defaults to the world's `restitution`.
   * @param {number} [spec.friction=0.6] Ground/ground-contact friction 0..1.
   * @param {boolean} [spec.isStatic=false] Immovable body (ground, walls, platforms).
   * @param {*} [spec.tag] Opaque marker the game can read off `body.tag`.
   * @param {THREE.Object3D} [spec.object] Object whose `position` syncs to the body every step; its `rotation` is never touched.
   * @param {function} [spec.onCollide] `fn(self, other, contact)` fired per step while overlapping.
   * @returns {object} body — members: `shape`, `position` (Vector3), `velocity` (Vector3),
   *   `mass`, `restitution`, `friction`, `isStatic`, `tag`, `object`, plus
   *   `applyImpulse(v)` (adds `v / mass` to velocity; no-op on static bodies),
   *   `teleport(v)` (moves the body to `v` instantly, zeroing velocity),
   *   and `dispose()` (removes the body from the world).
   * @throws {Error} When the shape is unknown or a box/sphere is missing its size/radius.
   */
  world.addBody = function addBody(spec) {
    if (disposed) {
      throw new Error(
        "addBody: this world has been disposed. Create a new world with createWorld()."
      )
    }
    const body = makeBody(spec, defaultRestitution)
    body.world = world
    body.dispose = function dispose() {
      world.removeBody(body)
    }
    bodies.push(body)
    return body
  }

  /**
   * Removes a body from the world. Unknown or already-removed bodies are
   * silently ignored so callers can dispose defensively.
   *
   * @param {object} body Body previously returned by `addBody`.
   * @returns {void}
   */
  world.removeBody = function removeBody(body) {
    const index = bodies.indexOf(body)
    if (index !== -1) {
      bodies.splice(index, 1)
    }
    body.dead = true
  }

  /**
   * Advances the simulation: gravity, integration, collision detection and
   * response, position sync and collision callbacks. Runs as many `fixedStep`
   * sub-steps as fit in `dt` (leftover time accumulates for the next call).
   *
   * @param {number} dt Seconds since the last call; clamped to at most 10 sub-steps per call so a stalled tab never explodes the simulation.
   * @returns {void}
   */
  world.step = function step(dt) {
    if (disposed) return
    const frame = num(dt, 0)
    accumulator += Math.max(0, frame)
    const MAX_STEPS = 10
    let steps = 0
    while (accumulator >= fixedStep && steps < MAX_STEPS) {
      substep(fixedStep)
      accumulator -= fixedStep
      steps++
    }
    if (steps === MAX_STEPS) accumulator = 0 // Drop backlog instead of spiral-of-death.
  }

  /**
   * Registers a world-level collision listener.
   *
   * @param {function} fn `fn(a, b, contact)` fired for every contacting pair each step.
   * @returns {function(): void} Unsubscribe function.
   * @throws {Error} When `fn` is not a function.
   */
  world.onCollision = function onCollision(fn) {
    if (typeof fn !== "function") {
      throw new Error(
        "onCollision: pass a callback function, e.g. world.onCollision((a, b, contact) => { ... })."
      )
    }
    collisionListeners.add(fn)
    return function off() {
      collisionListeners.delete(fn)
    }
  }

  /**
   * Analytic raycast against every body's primitive (AABB for boxes, exact
   * sphere, half-space for planes). Returns the closest hit.
   *
   * @param {object} origin Ray origin, Vector3-like.
   * @param {object} dir Ray direction, Vector3-like (does not need to be normalized; distances are along `dir`).
   * @param {object} [o] Options; unknown keys are ignored.
   * @param {number} [o.maxDistance=Infinity] Cull hits further than this along `dir`.
   * @returns {object|null} hit — `{ body, point: THREE.Vector3, distance, normal: THREE.Vector3 }` (normal faces the ray origin), or `null` when nothing is hit.
   */
  world.raycast = function raycast(origin, dir, o = {}) {
    if (!isVecLike(origin) || !isVecLike(dir)) {
      throw new Error(
        'raycast: "origin" and "dir" must be Vector3-like, e.g. raycast(camera.position, camera.getWorldDirection(new THREE.Vector3())).'
      )
    }
    const maxDistance = num(o.maxDistance, Infinity)
    const ox = origin.x
    const oy = origin.y
    const oz = origin.z
    let dx = dir.x
    let dy = dir.y
    let dz = dir.z
    const lenSq = dx * dx + dy * dy + dz * dz
    if (lenSq <= 0) return null
    if (lenSq !== 1) {
      const inv = 1 / Math.sqrt(lenSq)
      dx *= inv
      dy *= inv
      dz *= inv
    }

    let best = null
    for (const body of bodies) {
      const hit = rayBody(body, ox, oy, oz, dx, dy, dz, maxDistance)
      if (hit && (best === null || hit.distance < best.distance)) best = hit
    }
    return best
  }

  /**
   * Returns every body whose AABB intersects the given axis-aligned box.
   *
   * @param {object} box Box to test, `{ min: Vector3-like, max: Vector3-like }`.
   * @returns {object[]} Bodies (possibly empty) overlapping the box.
   * @throws {Error} When `box.min` or `box.max` is not Vector3-like.
   */
  world.overlap = function overlap(box) {
    if (!box || !isVecLike(box.min) || !isVecLike(box.max)) {
      throw new Error(
        'overlap: "box" must be { min: Vector3-like, max: Vector3-like }, e.g. overlap({ min: new THREE.Vector3(-1, -1, -1), max: new THREE.Vector3(1, 1, 1) }).'
      )
    }
    const result = []
    for (const body of bodies) {
      const e = extents(body)
      if (
        body.position.x - e.hx < box.max.x &&
        body.position.x + e.hx > box.min.x &&
        body.position.y - e.hy < box.max.y &&
        body.position.y + e.hy > box.min.y &&
        body.position.z - e.hz < box.max.z &&
        body.position.z + e.hz > box.min.z
      ) {
        result.push(body)
      }
    }
    return result
  }

  world.dispose = function dispose() {
    if (disposed) return
    disposed = true
    bodies.length = 0
    collisionListeners.clear()
  }

  // --- internals ------------------------------------------------------------

  function substep(h) {
    // Integrate dynamic bodies.
    for (const body of bodies) {
      if (body.invMass === 0) continue
      body.velocity.y += gravity * h
      body.position.x += body.velocity.x * h
      body.position.y += body.velocity.y * h
      body.position.z += body.velocity.z * h
    }

    // Detect every overlapping pair once; resolution and callbacks share the
    // same contact list, so a resolved-apart impact still fires its callbacks.
    const contacts = []
    for (let i = 0; i < bodies.length; i++) {
      const a = bodies[i]
      for (let j = i + 1; j < bodies.length; j++) {
        const b = bodies[j]
        if (a.invMass === 0 && b.invMass === 0) continue
        const c = collide(a, b)
        if (c) contacts.push({ a, b, c })
      }
    }

    // Resolve: impulse response + positional correction per contact.
    for (const { a, b, c } of contacts) resolve(a, b, c)

    // Sync attached objects, then fire callbacks once per step of overlap.
    for (const body of bodies) {
      if (body.object) body.object.position.copy(body.position)
    }
    const contact = { normal: new THREE.Vector3(), depth: 0 }
    for (const { a, b, c } of contacts) {
      fireCollision(a, b, c)
      if (collisionListeners.size > 0) {
        contact.normal.copy(c.normal)
        contact.depth = c.depth
        for (const fn of collisionListeners) fn(a, b, contact)
      }
    }
  }

  /**
   * Narrow-phase dispatch: returns a contact `{ normal, depth }` (normal
   * points from `b` towards `a`) or `null` when the pair does not overlap.
   */
  function collide(a, b) {
    if (a.shape === "plane" || b.shape === "plane") return planeContact(a, b)
    if (a.shape === "sphere" && b.shape === "sphere") return sphereSphere(a, b)
    if (a.shape === "sphere" || b.shape === "sphere") return sphereBox(a, b)
    return boxBox(a, b)
  }

  /** Sphere-sphere contact. */
  function sphereSphere(a, b) {
    const n = new THREE.Vector3().subVectors(a.position, b.position)
    const dist = n.length()
    const depth = a.radius + b.radius - dist
    if (depth <= 0) return null
    if (dist > 1e-8) n.divideScalar(dist)
    else n.set(0, 1, 0)
    return { normal: n, depth }
  }

  /**
   * Sphere vs box (either argument order): closest-point test against the
   * box's AABB. Falls back to an axis normal when the center is inside.
   */
  function sphereBox(a, b) {
    const sphere = a.shape === "sphere" ? a : b
    const box = sphere === a ? b : a
    const e = extents(box)
    const closest = new THREE.Vector3(
      clamp(sphere.position.x, box.position.x - e.hx, box.position.x + e.hx),
      clamp(sphere.position.y, box.position.y - e.hy, box.position.y + e.hy),
      clamp(sphere.position.z, box.position.z - e.hz, box.position.z + e.hz)
    )
    const delta = new THREE.Vector3().subVectors(sphere.position, closest)
    const distSq = delta.lengthSq()
    if (distSq > sphere.radius * sphere.radius) return null
    // Normal points from box towards sphere (contact convention).
    if (distSq > 1e-12) {
      const dist = Math.sqrt(distSq)
      return { normal: delta.divideScalar(dist), depth: sphere.radius - dist }
    }
    // Sphere center inside the box: push out along the shallowest axis.
    const ox =
      e.hx + sphere.radius - Math.abs(sphere.position.x - box.position.x)
    const oy =
      e.hy + sphere.radius - Math.abs(sphere.position.y - box.position.y)
    const oz =
      e.hz + sphere.radius - Math.abs(sphere.position.z - box.position.z)
    if (ox <= oy && ox <= oz) {
      return {
        normal: new THREE.Vector3(
          sphere.position.x >= box.position.x ? 1 : -1,
          0,
          0
        ),
        depth: ox,
      }
    }
    if (oy <= oz) {
      return {
        normal: new THREE.Vector3(
          0,
          sphere.position.y >= box.position.y ? 1 : -1,
          0
        ),
        depth: oy,
      }
    }
    return {
      normal: new THREE.Vector3(
        0,
        0,
        sphere.position.z >= box.position.z ? 1 : -1
      ),
      depth: oz,
    }
  }

  /**
   * Contacts involving a plane. A plane pushes other bodies out of the
   * half-space around it along y (boxes via half extents, spheres via
   * radius); two planes never touch each other.
   */
  function planeContact(a, b) {
    const plane = a.shape === "plane" ? a : b
    const other = plane === a ? b : a
    if (other.shape === "plane") return null
    const half =
      other.shape === "sphere"
        ? other.radius
        : Math.max(other.size.y * 0.5, 1e-4)
    const dy = other.position.y - plane.position.y
    if (dy >= half || dy <= -half) return null
    const depth = half - Math.abs(dy)
    const normal =
      dy >= 0 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(0, -1, 0)
    return plane === a
      ? { normal, depth }
      : { normal: normal.clone().negate(), depth }
  }

  /** AABB vs AABB contact via overlap on each axis; picks the shallowest axis. */
  function boxBox(a, b) {
    const ea = extents(a)
    const eb = extents(b)
    const dx = a.position.x - b.position.x
    const dy = a.position.y - b.position.y
    const dz = a.position.z - b.position.z
    const ox = ea.hx + eb.hx - Math.abs(dx)
    const oy = ea.hy + eb.hy - Math.abs(dy)
    const oz = ea.hz + eb.hz - Math.abs(dz)
    if (ox <= 0 || oy <= 0 || oz <= 0) return null
    const normal = new THREE.Vector3()
    let depth = 0
    if (ox <= oy && ox <= oz) {
      normal.set(dx >= 0 ? 1 : -1, 0, 0)
      depth = ox
    } else if (oy <= oz) {
      normal.set(0, dy >= 0 ? 1 : -1, 0)
      depth = oy
    } else {
      normal.set(0, 0, dz >= 0 ? 1 : -1)
      depth = oz
    }
    return { normal, depth }
  }

  /**
   * Impulse-based response: bounces bodies apart along `contact.normal`,
   * applies friction on the tangent, and pushes overlapping positions apart
   * proportionally to inverse mass so resting bodies do not jitter.
   */
  function resolve(a, b, contact) {
    const n = contact.normal // Points from b towards a.
    const restitution = Math.max(a.restitution, b.restitution)
    const invSum = a.invMass + b.invMass
    if (invSum <= 0) return

    const relVel = new THREE.Vector3().subVectors(a.velocity, b.velocity)
    const vn = relVel.dot(n)

    // Only resolve when bodies move towards each other along the normal.
    if (vn < 0) {
      const jImpulse = (-(1 + restitution) * vn) / invSum
      a.velocity.addScaledVector(n, jImpulse * a.invMass)
      b.velocity.addScaledVector(n, -jImpulse * b.invMass)

      // Simple tangential friction on the dominant non-normal axis.
      const tangent = relVel.clone().addScaledVector(n, -vn)
      if (tangent.lengthSq() > 1e-10) {
        tangent.normalize()
        const jt = -tangent.dot(
          new THREE.Vector3().subVectors(a.velocity, b.velocity)
        )
        const effective = Math.max(a.friction, b.friction)
        const capped = jt * effective
        a.velocity.addScaledVector(tangent, capped * a.invMass)
        b.velocity.addScaledVector(tangent, -capped * b.invMass)
      }
    }

    // Positional correction proportional to inverse mass (Baumgarte-style).
    const correction = (contact.depth / invSum) * 0.8
    a.position.addScaledVector(n, correction * a.invMass)
    b.position.addScaledVector(n, -correction * b.invMass)
  }

  /**
   * Analytic ray vs one body. Returns `{ body, point, distance, normal }`
   * (normal faces the ray origin) or `null`.
   */
  function rayBody(body, ox, oy, oz, dx, dy, dz, maxDistance) {
    if (body.shape === "sphere") {
      const ex = body.position.x - ox
      const ey = body.position.y - oy
      const ez = body.position.z - oz
      const b = ex * dx + ey * dy + ez * dz
      const c = ex * ex + ey * ey + ez * ez - body.radius * body.radius
      const disc = b * b - c
      if (disc < 0) return null
      const sq = Math.sqrt(disc)
      let t = b - sq
      if (t < 0) t = b + sq // Ray starts inside the sphere.
      if (t < 0 || t > maxDistance) return null
      return {
        body,
        point: new THREE.Vector3(ox + dx * t, oy + dy * t, oz + dz * t),
        distance: t,
        normal: new THREE.Vector3(
          (ox + dx * t - body.position.x) / body.radius,
          (oy + dy * t - body.position.y) / body.radius,
          (oz + dz * t - body.position.z) / body.radius
        ),
      }
    }
    if (body.shape === "plane") {
      // Plane is an x/z half-space centered at body.position.y; hit from above or below.
      if (dy === 0) return null
      const t = (body.position.y - oy) / dy
      if (t < 0 || t > maxDistance) return null
      return {
        body,
        point: new THREE.Vector3(ox + dx * t, body.position.y, oz + dz * t),
        distance: t,
        normal: new THREE.Vector3(0, dy > 0 ? -1 : 1, 0),
      }
    }
    // Box: slab method on the AABB.
    const e = extents(body)
    let tmin = 0
    let tmax = maxDistance
    let axis = -1
    let sign = 1
    const oc = [ox, oy, oz]
    const dc = [dx, dy, dz]
    const pc = [body.position.x, body.position.y, body.position.z]
    const hc = [e.hx, e.hy, e.hz]
    for (let axisIndex = 0; axisIndex < 3; axisIndex++) {
      const o = oc[axisIndex]
      const d = dc[axisIndex]
      const p = pc[axisIndex]
      const h = hc[axisIndex]
      if (Math.abs(d) < 1e-12) {
        if (o < p - h || o > p + h) return null
        continue
      }
      let t1 = (p - h - o) / d
      let t2 = (p + h - o) / d
      let s = -1 // Normal points towards -axis for the near face.
      if (t1 > t2) {
        const tmp = t1
        t1 = t2
        t2 = tmp
        s = 1
      }
      if (t1 > tmin) {
        tmin = t1
        axis = axisIndex
        sign = s
      }
      if (t2 < tmax) tmax = t2
      if (tmin > tmax) return null
    }
    if (tmin <= 0 || tmin > maxDistance) return null
    const normal = new THREE.Vector3()
    if (axis === 0) normal.set(sign, 0, 0)
    else if (axis === 1) normal.set(0, sign, 0)
    else normal.set(0, 0, sign)
    return {
      body,
      point: new THREE.Vector3(ox + dx * tmin, oy + dy * tmin, oz + dz * tmin),
      distance: tmin,
      normal,
    }
  }

  return world
}

/**
 * Applies an instantaneous impulse to a body: adds `v / mass` to its velocity.
 * Static bodies (and bodies with mass `0`) ignore impulses. Called as a body
 * method, so `this` is the body record.
 *
 * @param {object} v Impulse vector, Vector3-like.
 * @returns {void}
 */
function applyImpulse(v) {
  if (!isVecLike(v)) {
    throw new Error(
      "applyImpulse: pass a Vector3-like impulse, e.g. body.applyImpulse({ x: 0, y: 5, z: 0 })."
    )
  }
  if (this.invMass === 0) return
  this.velocity.x += v.x * this.invMass
  this.velocity.y += v.y * this.invMass
  this.velocity.z += v.z * this.invMass
}

/**
 * Moves a body to `v` instantly, zeroing its velocity. Use it to respawn or
 * reposition without simulating the travel. Called as a body method.
 *
 * @param {object} v Destination position, Vector3-like.
 * @returns {void}
 */
function teleport(v) {
  if (!isVecLike(v)) {
    throw new Error(
      "teleport: pass a Vector3-like position, e.g. body.teleport({ x: 0, y: 10, z: 0 })."
    )
  }
  this.position.set(v.x, v.y, v.z)
  this.velocity.set(0, 0, 0)
  if (this.object) this.object.position.copy(this.position)
}

/**
 * Removes the body from its world. Safe to call twice; world.removeBody
 * tolerates unknown bodies. Bodies created by `createWorld().addBody` get a
 * per-world `dispose` closure instead, so this generic version is a fallback
 * for hand-built records.
 *
 * @returns {void}
 */
function disposeBody() {
  if (this.world) this.world.removeBody(this)
}
